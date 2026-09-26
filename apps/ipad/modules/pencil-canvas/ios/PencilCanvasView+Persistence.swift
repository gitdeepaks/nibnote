import ExpoModulesCore
import PencilKit
import UIKit

/// A drawing snapshot plus everything needed to write it. Built on the main actor, written by the
/// `DrawingStore` actor, so the canvas never waits for disk I/O.
struct SaveRequest: Sendable {
    let page: PageRef
    let drawing: PKDrawing
    let thumbnail: ThumbnailRequest
}

extension PencilCanvasView {
    static func thumbnailURL(pageId: String) -> URL {
        let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first
            ?? FileManager.default.temporaryDirectory
        return caches.appendingPathComponent("thumbs", isDirectory: true).appendingPathComponent("\(pageId).png")
    }

    // MARK: - Load

    func load(_ target: PageRef) {
        loadGeneration += 1
        let generation = loadGeneration
        pageState = .loading
        hasUnsavedChanges = false
        autosave.cancel()
        canvasView.drawingGestureRecognizer.isEnabled = false
        replaceDrawing(with: PKDrawing())
        let store = store
        Task { [weak self] in
            let result: Result<LoadOutcome, DrawingStoreError>
            do throws(DrawingStoreError) {
                result = .success(try await store.load(from: target.fileURL))
            } catch {
                result = .failure(error)
            }
            self?.finishLoad(result, target: target, generation: generation)
        }
    }

    private func finishLoad(_ result: Result<LoadOutcome, DrawingStoreError>, target: PageRef, generation: Int) {
        // A newer page was requested while this one was loading.
        guard generation == loadGeneration, target == page else { return }
        switch result {
        case let .success(outcome):
            replaceDrawing(with: outcome.drawing)
            pageState = .ready
            canvasView.drawingGestureRecognizer.isEnabled = true
            if outcome.recoveredFromBackup {
                emitError(
                    code: "recoveredFromBackup", message: "The page file was damaged; loaded the last good version")
            }
        case let .failure(error):
            pageState = .readOnly
            emitError(code: error == .corrupt ? "fileCorrupt" : "readFailed", message: "\(error)")
        }
        emitDrawingChanged()
    }

    /// Programmatic drawing changes are not user edits: they don't mark the page unsaved and
    /// start with an empty undo history.
    func replaceDrawing(with drawing: PKDrawing) {
        isReplacingDrawing = true
        canvasView.drawing = drawing
        isReplacingDrawing = false
        canvasView.pageUndoManager.removeAllActions()
    }

    // MARK: - Save

    func makeSaveRequest() -> SaveRequest? {
        guard let page, pageState == .ready else { return nil }
        let thumbnail = ThumbnailRequest(
            url: Self.thumbnailURL(pageId: page.pageId), pageSize: surface.pageSize, template: surface.template)
        return SaveRequest(page: page, drawing: canvasView.drawing, thumbnail: thumbnail)
    }

    /// Autosave and flush path: does nothing when there is nothing new to write.
    func saveCurrentPage() async {
        guard hasUnsavedChanges, let request = makeSaveRequest() else { return }
        _ = await perform(request)
    }

    /// `ref.save()` from JS: always writes, then resolves with the result or rejects.
    func save(resolving promise: Promise) {
        Task {
            do {
                promise.resolve(try await saveForJS())
            } catch {
                promise.reject(error)
            }
        }
    }

    private func saveForJS() async throws -> SaveResultRecord {
        autosave.cancel()
        guard let request = makeSaveRequest() else { throw CanvasNotReadyException() }
        switch await perform(request) {
        case let .success(outcome):
            let record = SaveResultRecord()
            record.fileUri = outcome.fileURL.absoluteString
            record.sha256 = outcome.sha256
            record.thumbnailUri = outcome.thumbnailURL.absoluteString
            record.strokeCount = outcome.strokeCount
            return record
        case let .failure(error):
            throw SaveFailedException("\(error)")
        }
    }

    /// The outgoing page is saved from a snapshot, so switching pages never waits for disk.
    func flushOutgoingPage() {
        autosave.cancel()
        guard hasUnsavedChanges, let request = makeSaveRequest() else { return }
        Task { _ = await perform(request) }
    }

    private func perform(_ request: SaveRequest) async -> Result<SaveOutcome, DrawingStoreError> {
        let isCurrentPage = request.page == page
        if isCurrentPage {
            hasUnsavedChanges = false
        }
        let result: Result<SaveOutcome, DrawingStoreError>
        do throws(DrawingStoreError) {
            result = .success(
                try await store.save(request.drawing, to: request.page.fileURL, thumbnail: request.thumbnail))
        } catch {
            result = .failure(error)
        }
        let stillCurrent = request.page == page
        switch result {
        case .success:
            if stillCurrent {
                scheduleDrawingChangedEvent()
            }
        case let .failure(error):
            if stillCurrent {
                hasUnsavedChanges = true
            }
            emitError(pageId: request.page.pageId, code: "saveFailed", message: "\(error)")
        }
        return result
    }

    // MARK: - Undo, redo, debug

    func undo() {
        guard pageState == .ready, canvasView.pageUndoManager.canUndo else { return }
        canvasView.pageUndoManager.undo()
        scheduleDrawingChangedEvent()
    }

    func redo() {
        guard pageState == .ready, canvasView.pageUndoManager.canRedo else { return }
        canvasView.pageUndoManager.redo()
        scheduleDrawingChangedEvent()
    }

    /// Canvas Lab only: fills the page with synthetic strokes for the performance exit criteria.
    /// Counts as a user edit, so it is autosaved like real ink.
    func debugFillStrokes(count: Int) {
        #if DEBUG
        guard pageState == .ready else { return }
        canvasView.drawing = SyntheticStrokes.drawing(count: min(max(count, 0), 5000), pageSize: surface.pageSize)
        #endif
    }
}
