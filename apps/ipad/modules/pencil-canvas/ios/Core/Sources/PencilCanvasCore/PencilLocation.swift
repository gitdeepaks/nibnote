import CoreGraphics

/// Where the Pencil is when it double-taps or squeezes, so the palette can open at its tip.
enum PencilLocation {
    /// The hover position when the Pencil is in hover range (only some iPads can tell); otherwise
    /// where it last touched the page, if that spot is still on screen. Nil when neither is known.
    static func choose(hover: CGPoint?, lastTouch: CGPoint?, visible: CGRect) -> CGPoint? {
        if let hover {
            return hover
        }
        guard let lastTouch, visible.contains(lastTouch) else { return nil }
        return lastTouch
    }
}
