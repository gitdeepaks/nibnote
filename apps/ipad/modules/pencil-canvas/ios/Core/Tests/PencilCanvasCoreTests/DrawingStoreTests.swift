import CryptoKit
import PencilKit
import XCTest

@testable import PencilCanvasCore

final class DrawingStoreTests: XCTestCase {
    private var root = URL(fileURLWithPath: NSTemporaryDirectory())
    private let page = CGSize(width: 595, height: 842)

    override func setUpWithError() throws {
        root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    }

    override func tearDownWithError() throws {
        try FileManager.default.removeItem(at: root)
    }

    private var drawingURL: URL {
        root.appendingPathComponent("notebooks/n1/page.drawing")
    }

    private func thumbnail(template: PageTemplateSpec = .lined(spacing: 24)) -> ThumbnailRequest {
        ThumbnailRequest(url: root.appendingPathComponent("thumbs/page.png"), pageSize: page, template: template)
    }

    func testSaveThenLoadRoundTripsTheDrawing() async throws {
        let store = DrawingStore(sandboxRoot: root)
        let drawing = SyntheticStrokes.drawing(count: 50, pageSize: page)

        let saved = try await store.save(drawing, to: drawingURL)
        let loaded = try await store.load(from: drawingURL)

        XCTAssertEqual(saved.strokeCount, 50)
        XCTAssertFalse(loaded.recoveredFromBackup)
        // PencilKit's serialisation isn't byte-stable across a decode/encode cycle, so compare
        // the strokes themselves rather than the bytes.
        XCTAssertEqual(loaded.drawing.strokes.count, 50)
        XCTAssertEqual(loaded.drawing.bounds, drawing.bounds)
        for (original, restored) in zip(drawing.strokes, loaded.drawing.strokes) {
            XCTAssertEqual(restored.ink.inkType, original.ink.inkType)
            XCTAssertEqual(restored.path.count, original.path.count)
            XCTAssertEqual(restored.renderBounds, original.renderBounds)
        }
    }

    func testTheFileOnDiskIsExactlyWhatWasSaved() async throws {
        let store = DrawingStore(sandboxRoot: root)
        let drawing = SyntheticStrokes.drawing(count: 20, pageSize: page)
        _ = try await store.save(drawing, to: drawingURL)
        let decoded = try PKDrawing(data: Data(contentsOf: drawingURL))
        XCTAssertEqual(decoded.strokes.count, 20)
        XCTAssertEqual(decoded.bounds, drawing.bounds)
    }

    func testReportsTheSHA256OfTheFileOnDisk() async throws {
        let store = DrawingStore(sandboxRoot: root)
        let saved = try await store.save(SyntheticStrokes.drawing(count: 5, pageSize: page), to: drawingURL)
        let onDisk = try Data(contentsOf: drawingURL)
        let expected = SHA256.hash(data: onDisk).map { String(format: "%02x", $0) }.joined()
        XCTAssertEqual(saved.sha256, expected)
        XCTAssertEqual(saved.sha256.count, 64)
    }

    func testWritesAThumbnailAtTheRequestedWidth() async throws {
        let request = thumbnail()
        try await ThumbnailWriter(sandboxRoot: root).write(SyntheticStrokes.drawing(count: 5, pageSize: page),
                                                          request: request)
        let image = try XCTUnwrap(UIImage(contentsOfFile: request.url.path))
        XCTAssertEqual(image.size.width * image.scale, 480, accuracy: 1)
    }

    func testThumbnailWriterRefusesPathsOutsideTheSandbox() async {
        let outside = ThumbnailRequest(
            url: URL(fileURLWithPath: "/tmp/elsewhere/t.png"), pageSize: page, template: .blank)
        do {
            try await ThumbnailWriter(sandboxRoot: root).write(PKDrawing(), request: outside)
            XCTFail("expected outsideSandbox")
        } catch {
            XCTAssertEqual(error, .outsideSandbox)
        }
    }

    func testMissingFileLoadsAsAnEmptyPage() async throws {
        let loaded = try await DrawingStore(sandboxRoot: root).load(from: drawingURL)
        XCTAssertTrue(loaded.drawing.strokes.isEmpty)
        XCTAssertFalse(loaded.recoveredFromBackup)
    }

    func testKeepsThePreviousVersionAsBackupAndLeavesNoTempFile() async throws {
        let store = DrawingStore(sandboxRoot: root)
        let first = SyntheticStrokes.drawing(count: 3, pageSize: page)
        _ = try await store.save(first, to: drawingURL)
        _ = try await store.save(SyntheticStrokes.drawing(count: 7, pageSize: page), to: drawingURL)

        let backup = try PKDrawing(data: Data(contentsOf: DrawingStore.backupURL(for: drawingURL)))
        XCTAssertEqual(backup.strokes.count, 3)
        XCTAssertFalse(FileManager.default.fileExists(atPath: DrawingStore.temporaryURL(for: drawingURL).path))
        let latest = try await store.load(from: drawingURL)
        XCTAssertEqual(latest.drawing.strokes.count, 7)
    }

    func testCorruptFileRecoversFromBackup() async throws {
        let store = DrawingStore(sandboxRoot: root)
        _ = try await store.save(SyntheticStrokes.drawing(count: 4, pageSize: page), to: drawingURL)
        _ = try await store.save(SyntheticStrokes.drawing(count: 9, pageSize: page), to: drawingURL)
        try Data("not a drawing".utf8).write(to: drawingURL)

        let loaded = try await store.load(from: drawingURL)
        XCTAssertTrue(loaded.recoveredFromBackup)
        XCTAssertEqual(loaded.drawing.strokes.count, 4)

        // The primary is restored, so a later save can't rotate the corrupt bytes into `.bak`.
        XCTAssertEqual(try PKDrawing(data: Data(contentsOf: drawingURL)).strokes.count, 4)
        _ = try await store.save(SyntheticStrokes.drawing(count: 6, pageSize: page), to: drawingURL)
        let backup = try PKDrawing(data: Data(contentsOf: DrawingStore.backupURL(for: drawingURL)))
        XCTAssertEqual(backup.strokes.count, 4)
    }

    func testCorruptFileWithoutBackupIsReportedNotCrashed() async throws {
        try FileManager.default.createDirectory(
            at: drawingURL.deletingLastPathComponent(), withIntermediateDirectories: true)
        try Data("not a drawing".utf8).write(to: drawingURL)
        do {
            _ = try await DrawingStore(sandboxRoot: root).load(from: drawingURL)
            XCTFail("expected a corrupt-file error")
        } catch {
            XCTAssertEqual(error, .corrupt)
        }
    }

    func testRefusesPathsOutsideTheSandbox() async throws {
        let store = DrawingStore(sandboxRoot: root)
        let outside = URL(fileURLWithPath: "/tmp/elsewhere/page.drawing")
        do {
            _ = try await store.load(from: outside)
            XCTFail("expected outsideSandbox")
        } catch {
            XCTAssertEqual(error, .outsideSandbox)
        }
        do {
            _ = try await store.save(PKDrawing(), to: outside)
            XCTFail("expected outsideSandbox")
        } catch {
            XCTAssertEqual(error, .outsideSandbox)
        }
    }

    func testSandboxPolicyTreatsPrivateVarAsVar() throws {
        let root = URL(fileURLWithPath: "/var/mobile/Containers/Data/Application/ABC")
        let privateSpelling = "/private/var/mobile/Containers/Data/Application/ABC/Documents/p.drawing"
        XCTAssertTrue(SandboxPolicy.contains(URL(fileURLWithPath: privateSpelling), root: root))
        XCTAssertFalse(SandboxPolicy.contains(
            URL(fileURLWithPath: "/var/mobile/Containers/Data/Application/ABCD/Documents/p.drawing"), root: root))
        XCTAssertFalse(SandboxPolicy.contains(
            URL(fileURLWithPath: "/var/mobile/Containers/Data/Application/ABC/../XYZ/p.drawing"), root: root))
        XCTAssertFalse(SandboxPolicy.contains(try XCTUnwrap(URL(string: "https://example.com/p")), root: root))
    }

    /// Exit criterion: saving a 500-stroke page takes under 150 ms. The save is the durable part
    /// (serialize, atomic write, hash); thumbnails render separately and aren't on this path.
    func testSavingFiveHundredStrokesIsFast() async throws {
        let store = DrawingStore(sandboxRoot: root)
        let drawing = SyntheticStrokes.drawing(count: 500, pageSize: page)
        var durations: [Duration] = []
        for _ in 0..<5 {
            durations.append(try await store.save(drawing, to: drawingURL).duration)
        }
        let median = try XCTUnwrap(durations.sorted()[safe: 2])
        XCTAssertLessThan(median, .milliseconds(150), "median save took \(median)")
    }
}

private extension Array {
    subscript(safe index: Int) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}
