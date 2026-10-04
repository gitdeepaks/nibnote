import PencilKit

/// Works out which strokes a lasso selection holds, to copy them to another page. PencilKit doesn't
/// say what is selected, so the canvas runs its own Duplicate and this compares the page before and
/// after. A duplicate keeps its original's path and only moves it (measured: a translation of about
/// 22 × 15 pt), so each copy leads back to the stroke it came from, and the original is what gets
/// copied: same place, same mask.
enum SelectionCopy {
    /// What identifies a stroke's path: when it was drawn, its length and where it starts.
    struct PathKey: Hashable {
        let date: TimeInterval
        let count: Int
        let startX: Double
        let startY: Double
    }

    private struct PlacedKey: Hashable {
        let path: PathKey
        let offsetX: Int
        let offsetY: Int
    }

    /// Translations closer than this, in points, are the same.
    static let tolerance: CGFloat = 0.01

    static func pathKey(of stroke: PKStroke) -> PathKey {
        let start = stroke.path.first?.location ?? .zero
        return PathKey(
            date: stroke.path.creationDate.timeIntervalSinceReferenceDate, count: stroke.path.count,
            startX: Double(start.x), startY: Double(start.y))
    }

    private static func placedKey(of stroke: PKStroke) -> PlacedKey {
        PlacedKey(
            path: pathKey(of: stroke), offsetX: Int((stroke.transform.tx / tolerance).rounded()),
            offsetY: Int((stroke.transform.ty / tolerance).rounded()))
    }

    /// The strokes in `after` that `before` doesn't have, in order.
    static func added(before: [PKStroke], after: [PKStroke]) -> [PKStroke] {
        var remaining: [PlacedKey: Int] = [:]
        for stroke in before {
            remaining[placedKey(of: stroke), default: 0] += 1
        }
        return after.filter { stroke in
            let key = placedKey(of: stroke)
            guard let count = remaining[key], count > 0 else { return true }
            remaining[key] = count - 1
            return false
        }
    }

    /// How far Duplicate moved its copies: the translation that leads every copy back to a stroke
    /// already on the page. When an earlier duplicate sits exactly under a new copy, zero also
    /// fits, so the smallest translation that isn't zero wins.
    static func duplicateOffset(of copies: [PKStroke], before: [PKStroke]) -> CGVector? {
        guard let first = copies.first else { return nil }
        let byPath = Dictionary(grouping: before, by: pathKey(of:))
        let candidates = (byPath[pathKey(of: first)] ?? []).map { original in
            CGVector(dx: first.transform.tx - original.transform.tx, dy: first.transform.ty - original.transform.ty)
        }
        let scored = candidates.map { offset in
            (offset: offset, fits: copies.filter { original(of: $0, offset: offset, in: byPath) != nil }.count)
        }
        guard let best = scored.map(\.fits).max(), best > 0 else { return nil }
        let fitting = scored.filter { $0.fits == best }.map(\.offset)
        let moved = fitting.filter { hypot($0.dx, $0.dy) > tolerance }
        return (moved.isEmpty ? fitting : moved).min { hypot($0.dx, $0.dy) < hypot($1.dx, $1.dy) }
    }

    private static func original(
        of copy: PKStroke, offset: CGVector, in byPath: [PathKey: [PKStroke]]
    ) -> PKStroke? {
        (byPath[pathKey(of: copy)] ?? []).first { candidate in
            abs(copy.transform.tx - offset.dx - candidate.transform.tx) <= tolerance
                && abs(copy.transform.ty - offset.dy - candidate.transform.ty) <= tolerance
        }
    }

    /// The selected strokes: for each copy Duplicate added, the stroke it came from. A copy with no
    /// stroke to lead back to is moved back by the same offset instead.
    static func selected(before: [PKStroke], after: [PKStroke]) -> [PKStroke] {
        let copies = added(before: before, after: after)
        guard let offset = duplicateOffset(of: copies, before: before) else { return copies }
        let byPath = Dictionary(grouping: before, by: pathKey(of:))
        return copies.map { copy in
            original(of: copy, offset: offset, in: byPath)
                ?? moved(copy, by: CGVector(dx: -offset.dx, dy: -offset.dy))
        }
    }

    static func moved(_ stroke: PKStroke, by offset: CGVector) -> PKStroke {
        // The mask lives in the stroke's own coordinates, so it moves with the transform.
        PKStroke(
            ink: stroke.ink, path: stroke.path,
            transform: stroke.transform.concatenating(CGAffineTransform(translationX: offset.dx, y: offset.dy)),
            mask: stroke.mask)
    }

    /// The strokes as a group, moved just enough to lie on a page of this size. A group larger than
    /// the page starts at its top-left corner.
    static func fitted(_ strokes: [PKStroke], into page: CGSize) -> [PKStroke] {
        let bounds = strokes.reduce(CGRect.null) { $0.union(HighlighterEraser.bounds(of: $1)) }
        guard !bounds.isNull else { return strokes }
        let offset = CGVector(
            dx: shift(low: bounds.minX, high: bounds.maxX, limit: page.width),
            dy: shift(low: bounds.minY, high: bounds.maxY, limit: page.height))
        guard offset.dx != 0 || offset.dy != 0 else { return strokes }
        return strokes.map { moved($0, by: offset) }
    }

    private static func shift(low: CGFloat, high: CGFloat, limit: CGFloat) -> CGFloat {
        if low < 0 || high - low > limit { return -low }
        return high > limit ? limit - high : 0
    }

    /// The page with the strokes added on top.
    static func appending(_ strokes: [PKStroke], to drawing: PKDrawing) -> PKDrawing {
        PKDrawing(strokes: drawing.strokes + strokes)
    }
}
