import CryptoKit
import Foundation
import PencilKit
import UIKit

enum DrawingStoreError: Error, Equatable, Sendable {
    case outsideSandbox
    case corrupt
    case readFailed(String)
    case writeFailed(String)
}

struct LoadOutcome: Sendable {
    let drawing: PKDrawing
    let recoveredFromBackup: Bool
}

struct ThumbnailRequest: Sendable {
    let url: URL
    let pageSize: CGSize
    let template: PageTemplateSpec
    var pixelWidth: CGFloat = 480
}

struct SaveOutcome: Sendable {
    let fileURL: URL
    let sha256: String
    let thumbnailURL: URL
    let strokeCount: Int
    let duration: Duration
}

/// Only paths inside the app's own container may be read or written.
enum SandboxPolicy {
    static func contains(_ url: URL, root: URL) -> Bool {
        guard url.isFileURL, root.isFileURL else { return false }
        let rootPath = normalizedPath(root)
        let prefix = rootPath.hasSuffix("/") ? rootPath : rootPath + "/"
        return normalizedPath(url).hasPrefix(prefix)
    }

    /// `/var` is a symlink to `/private/var` on iOS; compare both spellings as one.
    static func normalizedPath(_ url: URL) -> String {
        let path = url.standardizedFileURL.path
        return path.hasPrefix("/private/var/") ? String(path.dropFirst("/private".count)) : path
    }
}

/// Reads and writes one page's drawing file. Writes are atomic (temp file, then swap), keep the
/// previous version as `<file>.bak`, and run off the main thread. Being an actor with no
/// suspension points inside `save`, it also serialises saves.
actor DrawingStore {
    private let sandboxRoot: URL

    init(sandboxRoot: URL = URL(fileURLWithPath: NSHomeDirectory(), isDirectory: true)) {
        self.sandboxRoot = sandboxRoot
    }

    static func backupURL(for url: URL) -> URL {
        url.deletingLastPathComponent().appendingPathComponent(url.lastPathComponent + ".bak")
    }

    static func temporaryURL(for url: URL) -> URL {
        url.deletingLastPathComponent().appendingPathComponent("." + url.lastPathComponent + ".tmp")
    }

    /// A missing file is a new, empty page. A corrupt file falls back to the backup.
    func load(from url: URL) throws(DrawingStoreError) -> LoadOutcome {
        guard SandboxPolicy.contains(url, root: sandboxRoot) else { throw .outsideSandbox }
        let backup = Self.backupURL(for: url)
        let fileManager = FileManager.default
        guard fileManager.fileExists(atPath: url.path) || fileManager.fileExists(atPath: backup.path) else {
            return LoadOutcome(drawing: PKDrawing(), recoveredFromBackup: false)
        }
        let primary = Self.readDrawing(at: url)
        if case let .success(drawing) = primary {
            return LoadOutcome(drawing: drawing, recoveredFromBackup: false)
        }
        if case let .success(drawing) = Self.readDrawing(at: backup) {
            // Put the good copy back in place now; otherwise the next save would rotate the
            // corrupt primary into `.bak` and lose the only readable version.
            Self.restorePrimary(url, from: backup)
            return LoadOutcome(drawing: drawing, recoveredFromBackup: true)
        }
        switch primary {
        case let .failure(error): throw error
        case .success: throw .corrupt
        }
    }

    func save(_ drawing: PKDrawing, to url: URL, thumbnail: ThumbnailRequest) throws(DrawingStoreError) -> SaveOutcome {
        guard
            SandboxPolicy.contains(url, root: sandboxRoot),
            SandboxPolicy.contains(thumbnail.url, root: sandboxRoot)
        else { throw .outsideSandbox }
        let clock = ContinuousClock()
        let start = clock.now
        let data = drawing.dataRepresentation()
        try Self.writeAtomically(data, to: url)

        let digest = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
        let png = Self.renderThumbnail(drawing: drawing, request: thumbnail)
        do {
            try FileManager.default.createDirectory(
                at: thumbnail.url.deletingLastPathComponent(), withIntermediateDirectories: true)
            try png.write(to: thumbnail.url, options: [.atomic])
        } catch {
            throw .writeFailed("thumbnail: \(error.localizedDescription)")
        }
        return SaveOutcome(
            fileURL: url, sha256: digest, thumbnailURL: thumbnail.url,
            strokeCount: drawing.strokes.count, duration: clock.now - start)
    }

    private static func readDrawing(at url: URL) -> Result<PKDrawing, DrawingStoreError> {
        let data: Data
        do {
            data = try Data(contentsOf: url)
        } catch {
            return .failure(.readFailed(error.localizedDescription))
        }
        do {
            return .success(try PKDrawing(data: data))
        } catch {
            return .failure(.corrupt)
        }
    }

    /// Best effort: if this fails the page still loads from the backup, and the next save
    /// writes a fresh primary.
    private static func restorePrimary(_ url: URL, from backup: URL) {
        let fileManager = FileManager.default
        let temporary = temporaryURL(for: url)
        do {
            if fileManager.fileExists(atPath: temporary.path) {
                try fileManager.removeItem(at: temporary)
            }
            try fileManager.copyItem(at: backup, to: temporary)
            _ = try fileManager.replaceItemAt(url, withItemAt: temporary)
        } catch {
            return
        }
    }

    private static func writeAtomically(_ data: Data, to url: URL) throws(DrawingStoreError) {
        let fileManager = FileManager.default
        let temporary = temporaryURL(for: url)
        let backup = backupURL(for: url)
        do {
            try fileManager.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
            if fileManager.fileExists(atPath: temporary.path) {
                try fileManager.removeItem(at: temporary)
            }
            try data.write(to: temporary, options: [.completeFileProtectionUntilFirstUserAuthentication])
            if fileManager.fileExists(atPath: url.path) {
                if fileManager.fileExists(atPath: backup.path) {
                    try fileManager.removeItem(at: backup)
                }
                try fileManager.copyItem(at: url, to: backup)
                _ = try fileManager.replaceItemAt(url, withItemAt: temporary)
            } else {
                try fileManager.moveItem(at: temporary, to: url)
            }
        } catch {
            throw .writeFailed(error.localizedDescription)
        }
    }

    /// Paper, template and ink, scaled to `pixelWidth`. Rendered in light appearance so
    /// thumbnails match the paper regardless of the system theme.
    static func renderThumbnail(drawing: PKDrawing, request: ThumbnailRequest) -> Data {
        let page = CGRect(origin: .zero, size: request.pageSize)
        let scale = request.pixelWidth / max(request.pageSize.width, 1)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        let size = CGSize(width: (page.width * scale).rounded(), height: (page.height * scale).rounded())
        let renderer = UIGraphicsImageRenderer(size: size, format: format)
        var ink = UIImage()
        UITraitCollection(userInterfaceStyle: .light).performAsCurrent {
            ink = drawing.image(from: page, scale: scale)
        }
        return renderer.pngData { rendererContext in
            let context = rendererContext.cgContext
            context.scaleBy(x: scale, y: scale)
            TemplateRenderer.draw(request.template, pageSize: request.pageSize, in: context, clip: page)
            ink.draw(in: page)
        }
    }
}
