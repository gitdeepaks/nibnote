import ExpoModulesCore

// Typed bridge shapes. Every field has a concrete type; JS validates with the Zod schemas in
// packages/shared/src/canvas.ts, and native validates again via the Core parsers.

struct ToolRecord: Record {
    @Field var kind: String = "lasso"
    @Field var ink: String?
    @Field var colorHex: String?
    @Field var width: Double?
    @Field var mode: String?
    @Field var highlighterOnly: Bool?

    var raw: RawCanvasTool {
        RawCanvasTool(
            kind: kind, ink: ink, colorHex: colorHex, width: width, mode: mode, highlighterOnly: highlighterOnly)
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

/// A point in the canvas view, in points from its top-left corner (`{ x, y }` in JS).
struct CanvasPointRecord: Record {
    @Field(.keyed("x")) var pointX: Double = 0
    @Field(.keyed("y")) var pointY: Double = 0
}

struct PencilActionRecord: Record {
    @Field var pageId: String = ""
    @Field var kind: String = "tap"
    @Field var preferredAction: String = "ignore"
    /// The hover position, else the last touch still on screen; nil when neither is known.
    @Field var location: CanvasPointRecord?
}

/// A tool started (`active`) or stopped touching the page: a stroke, an erase or a lasso.
struct ToolUsageRecord: Record {
    @Field var pageId: String = ""
    @Field var active: Bool = false
}

/// A two-finger (undo) or three-finger (redo) tap on the page, and whether there was anything to do.
struct HistoryGestureRecord: Record {
    @Field var pageId: String = ""
    @Field var action: String = "undo"
    @Field var applied: Bool = false
}

/// Development builds only: the Pencil Pro haptic played after a tool change made with the Pencil.
struct ToolFeedbackRecord: Record {
    @Field var pageId: String = ""
    /// "touch" (a Pencil tap outside the page), "tap" (double-tap) or "squeeze".
    @Field var source: String = "touch"
}

/// The lasso gained or lost a selection.
struct SelectionChangedRecord: Record {
    @Field var pageId: String = ""
    @Field var hasSelection: Bool = false
}

/// The page a selection is copied to: where its drawing lives, and what its thumbnail needs.
struct SelectionTargetRecord: Record {
    @Field var pageId: String = ""
    @Field var drawingFileUri: String = ""
    @Field var pageSize = PageSizeRecord()
    @Field var template = TemplateRecord()
}

/// How many strokes were copied; zero when nothing was selected.
struct SelectionCopyResultRecord: Record {
    @Field var strokeCount: Int = 0
}

/// Whether the last copy was taken back off its page.
struct SelectionUndoResultRecord: Record {
    @Field var undone: Bool = false
}

struct PageSwipeRecord: Record {
    @Field var pageId: String = ""
    /// "next" (swipe left) or "previous" (swipe right).
    @Field var direction: String = "next"
}

struct CanvasErrorRecord: Record {
    @Field var pageId: String = ""
    @Field var code: String = ""
    @Field var message: String = ""
}

/// Sent through the module after every successful save, including the flush when the view unmounts.
struct DrawingSavedRecord: Record {
    @Field var pageId: String = ""
    @Field var sha256: String = ""
    @Field var strokeCount: Int = 0
}

/// Sent through the module when a page's thumbnail file has been rewritten.
struct ThumbnailWrittenRecord: Record {
    @Field var pageId: String = ""
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

final class InvalidSelectionTargetException: Exception, @unchecked Sendable {
    override var reason: String {
        "The page to copy the selection to is missing, invalid or the page on screen"
    }
}

final class SaveFailedException: GenericException<String>, @unchecked Sendable {
    override var reason: String {
        "Saving the drawing failed: \(param)"
    }
}
