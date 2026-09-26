import ExpoModulesCore

// Typed bridge shapes. Every field has a concrete type; JS validates with the Zod schemas in
// packages/shared/src/canvas.ts, and native validates again via the Core parsers.

struct ToolRecord: Record {
    @Field var kind: String = "lasso"
    @Field var ink: String?
    @Field var colorHex: String?
    @Field var width: Double?
    @Field var mode: String?

    var raw: RawCanvasTool {
        RawCanvasTool(kind: kind, ink: ink, colorHex: colorHex, width: width, mode: mode)
    }
}

struct TemplateRecord: Record {
    @Field var kind: String = "blank"
    @Field var spacingPt: Double?
}

struct PageSizeRecord: Record {
    @Field var widthPt: Double = 595
    @Field var heightPt: Double = 842
}

struct DrawingChangedRecord: Record, Equatable {
    @Field var pageId: String = ""
    @Field var strokeCount: Int = 0
    @Field var canUndo: Bool = false
    @Field var canRedo: Bool = false
    @Field var hasUnsavedChanges: Bool = false

    static func == (lhs: DrawingChangedRecord, rhs: DrawingChangedRecord) -> Bool {
        lhs.pageId == rhs.pageId && lhs.strokeCount == rhs.strokeCount && lhs.canUndo == rhs.canUndo
            && lhs.canRedo == rhs.canRedo && lhs.hasUnsavedChanges == rhs.hasUnsavedChanges
    }
}

struct PencilActionRecord: Record {
    @Field var pageId: String = ""
    @Field var kind: String = "tap"
    @Field var preferredAction: String = "ignore"
}

struct CanvasErrorRecord: Record {
    @Field var pageId: String = ""
    @Field var code: String = ""
    @Field var message: String = ""
}

struct SaveResultRecord: Record {
    @Field var fileUri: String = ""
    @Field var sha256: String = ""
    @Field var thumbnailUri: String = ""
    @Field var strokeCount: Int = 0
}

// Swift 6 requires restating the base class's `@unchecked Sendable`. Safe: these add no stored state.
final class CanvasNotReadyException: Exception, @unchecked Sendable {
    override var reason: String {
        "The canvas has no writable page loaded yet"
    }
}

final class SaveFailedException: GenericException<String>, @unchecked Sendable {
    override var reason: String {
        "Saving the drawing failed: \(param)"
    }
}
