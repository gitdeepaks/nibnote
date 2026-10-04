import ExpoModulesCore
import PencilKit
import UIKit

/// A copy of a selection sent to another page, kept so it can be taken back.
struct SentSelection {
    /// The page the selection came from; the copy can only be undone while it is still on screen.
    let source: PageRef
    let target: PageRef
    let thumbnail: ThumbnailRequest
    /// The target page as it was before the copy.
    let previous: PKDrawing
    /// The target file's hash after the copy: if it has changed since, undoing would lose work.
    let resultHash: String
}

/// "Duplicate to another page" for the lasso. PencilKit has no API for its selection, and its edit
/// menu can't carry our own item (both measured in the M4 spikes), so the canvas reports whether a
/// selection exists, and copies it by running PencilKit's own Duplicate and comparing the page
/// before and after (`SelectionCopy`).
extension PencilCanvasView {
    /// PencilKit shows a selection in a view of its own that takes text input and becomes first
    /// responder; nothing else inside the canvas does.
    var hasSelection: Bool {
        guard let responder = UIResponder.currentFirstResponder(), responder is any UITextInput,
            let view = responder as? UIView
        else { return false }
        return view.isDescendant(of: canvasView)
    }

    /// Called whenever a selection could have appeared or gone: a touch lifted from the page, the
    /// page or the tool changed. PencilKit sends no notice when its selection view takes or gives up
    /// first responder, and it settles late (a selection dismissed by a tap was still first
    /// responder 250 ms later on the iPad), so this looks now and three more times.
    func selectionMayHaveChanged() {
        reportSelection()
        selectionCheck?.cancel()
        selectionCheck = Task { [weak self] in
            for wait in Self.selectionRechecks {
                try? await Task.sleep(for: wait)
                guard !Task.isCancelled else { return }
                self?.reportSelection()
            }
        }
    }

    /// Waits between the looks after a change: 250, 600 and 1,200 ms after it.
    private static let selectionRechecks: [Duration] = [.milliseconds(250), .milliseconds(350), .milliseconds(600)]

    private func reportSelection() {
        let selected = pageState == .ready && hasSelection
        guard selected != reportedSelection else { return }
        reportedSelection = selected
        let record = SelectionChangedRecord()
        record.pageId = pageId
        record.hasSelection = selected
        onSelectionChanged(record)
    }

    // MARK: - Copy to another page

    func copySelection(to target: SelectionTargetRecord, resolving promise: Promise) {
        Task {
            do {
                promise.resolve(try await copySelection(to: target))
            } catch {
                promise.reject(error)
            }
        }
    }

    private func copySelection(to record: SelectionTargetRecord) async throws -> SelectionCopyResultRecord {
        guard let source = page, pageState == .ready else { throw CanvasNotReadyException() }
        guard let url = URL(string: record.drawingFileUri), url.isFileURL, !record.pageId.isEmpty,
            let template = PageTemplateSpec.parse(kind: record.template.kind, spacingPt: record.template.spacingPt),
            record.pageSize.widthPt > 0, record.pageSize.heightPt > 0
        else { throw InvalidSelectionTargetException() }
        let target = PageRef(pageId: record.pageId, fileURL: url)
        guard target != source else { throw InvalidSelectionTargetException() }
        let pageSize = CGSize(width: record.pageSize.widthPt, height: record.pageSize.heightPt)

        let result = SelectionCopyResultRecord()
        let strokes = await selectedStrokes()
        guard !strokes.isEmpty else { return result }

        let loaded: LoadOutcome
        do throws(DrawingStoreError) {
            loaded = try await store.load(from: target.fileURL)
        } catch {
            throw SaveFailedException("\(error)")
        }
        let thumbnail = ThumbnailRequest(
            url: Self.thumbnailURL(pageId: target.pageId), pageSize: pageSize, template: template)
        let merged = SelectionCopy.appending(SelectionCopy.fitted(strokes, into: pageSize), to: loaded.drawing)
        switch await perform(SaveRequest(page: target, drawing: merged, thumbnail: thumbnail)) {
        case let .success(outcome):
            lastSelectionCopy = SentSelection(
                source: source, target: target, thumbnail: thumbnail, previous: loaded.drawing,
                resultHash: outcome.sha256)
            result.strokeCount = strokes.count
            return result
        case let .failure(error):
            throw SaveFailedException("\(error)")
        }
    }

    /// The selected strokes, found by running PencilKit's Duplicate and putting the page back. This
    /// is a probe, not an edit: it leaves no undo step, saves nothing and takes no touches meanwhile.
    private func selectedStrokes() async -> [PKStroke] {
        guard hasSelection, let source = page else { return [] }
        let before = canvasView.drawing
        let version = drawingVersion
        let generation = loadGeneration
        let undoManager = canvasView.pageUndoManager
        isReplacingDrawing = true
        canvasView.isUserInteractionEnabled = false
        undoManager.disableUndoRegistration()
        UIApplication.shared.sendAction(
            #selector(UIResponderStandardEditActions.duplicate(_:)), to: nil, from: nil, for: nil)
        // Duplicate changes the page a moment later (about 200 ms, measured).
        var waited = 0
        while drawingVersion == version, waited < 1000 {
            try? await Task.sleep(for: .milliseconds(20))
            waited += 20
        }
        undoManager.enableUndoRegistration()
        canvasView.isUserInteractionEnabled = true
        // A page opened meanwhile has replaced the drawing already; this page's strokes don't belong there.
        guard page == source, loadGeneration == generation else {
            isReplacingDrawing = false
            return []
        }
        let after = canvasView.drawing
        if drawingVersion != version {
            canvasView.drawing = before
        }
        isReplacingDrawing = false
        selectionMayHaveChanged()
        return SelectionCopy.selected(before: before.strokes, after: after.strokes)
    }

    // MARK: - Undo the copy

    func undoSelectionCopy(resolving promise: Promise) {
        Task {
            let record = SelectionUndoResultRecord()
            record.undone = await undoSelectionCopy()
            promise.resolve(record)
        }
    }

    /// Puts the target page back as it was. Only from the page the copy was made on, and only if
    /// the target hasn't changed since: otherwise it would throw away newer work.
    private func undoSelectionCopy() async -> Bool {
        guard let last = lastSelectionCopy, last.source == page else { return false }
        lastSelectionCopy = nil
        let hash: String?
        do throws(DrawingStoreError) {
            hash = try await store.fileHash(at: last.target.fileURL)
        } catch {
            return false
        }
        guard hash == last.resultHash else { return false }
        let request = SaveRequest(page: last.target, drawing: last.previous, thumbnail: last.thumbnail)
        if case .success = await perform(request) {
            return true
        }
        return false
    }
}
