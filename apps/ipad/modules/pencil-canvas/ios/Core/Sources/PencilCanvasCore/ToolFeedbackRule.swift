import Foundation

/// When a tool change plays the light Apple Pencil Pro haptic. A change counts when it came from
/// the Pencil: a Pencil tap outside the page (the toolbar, the palette, a popover) or a double-tap
/// or squeeze, at most `window` seconds before the new tool arrives. Width alone never counts (a
/// slider would buzz on every step), and neither does the first tool a canvas gets.
enum ToolFeedbackRule {
    static let window: TimeInterval = 0.5

    static func shouldPlay(
        previous: CanvasToolSpec?, next: CanvasToolSpec, lastPencilEvent: TimeInterval?, now: TimeInterval
    ) -> Bool {
        guard let previous, let lastPencilEvent, now >= lastPencilEvent, now - lastPencilEvent <= window else {
            return false
        }
        return withoutWidth(previous) != withoutWidth(next)
    }

    /// The tool with its width set aside, so two tools that differ only in width compare equal.
    static func withoutWidth(_ tool: CanvasToolSpec) -> CanvasToolSpec {
        switch tool {
        case let .ink(ink, color, _): .ink(ink, color: color, width: 0)
        case let .highlighter(color, _): .highlighter(color: color, width: 0)
        case let .eraser(mode, _, highlighterOnly): .eraser(mode, width: 0, highlighterOnly: highlighterOnly)
        case .lasso: .lasso
        }
    }
}
