import CoreGraphics

/// Recognises a hand-drawn line, ellipse, rectangle or triangle in one stroke and describes the
/// clean shape to draw instead. When in doubt it finds nothing: a stroke left as drawn is better
/// than the wrong shape. The limits were tuned on real handwriting in the Phase 3 M5 spike.
enum ShapeFit {
    enum Shape: Equatable, Sendable {
        case line(start: CGPoint, end: CGPoint)
        case ellipse(center: CGPoint, radii: CGSize, rotation: CGFloat)
        case rectangle(center: CGPoint, half: CGSize, rotation: CGFloat)
        case triangle(CGPoint, CGPoint, CGPoint)

        /// The shape's name as VoiceOver says it.
        var spokenName: String {
            switch self {
            case .line: "line"
            case .ellipse: "oval"
            case .rectangle: "rectangle"
            case .triangle: "triangle"
            }
        }
    }

    enum Limit {
        /// Every stroke is compared as this many points, the same distance apart.
        static let sampleCount = 64
        /// Strokes shorter than this on screen, in points, are handwriting, not shapes.
        static let minimumLength: CGFloat = 40
        /// A direction this close to level or upright snaps to it, in radians (about 7°).
        static let angleSnap: CGFloat = 0.12
        /// End-to-end distance over drawn length. Above `straight` a stroke may be a line; below
        /// `closed` its ends meet and it may be a closed shape. In between it is neither.
        static let straight: CGFloat = 0.9
        static let closed: CGFloat = 0.2
        /// How far a line may bow from its ends, as a share of its length.
        static let lineBow: CGFloat = 0.08
        /// How strongly the stroke's directions agree on two perpendicular axes (0 for a circle,
        /// 1 for a perfect rectangle) before it may be a rectangle, and before its sides count as
        /// clearly straight.
        static let edges: CGFloat = 0.45
        static let clearEdges: CGFloat = 0.55
        /// The average distance from the fitted shape, as a share of its size. A rectangle with
        /// clearly straight sides gets the looser limit, because a hand rounds its corners.
        static let rectangle: CGFloat = 0.1
        static let roundedRectangle: CGFloat = 0.135
        static let ellipse: CGFloat = 0.12
        static let triangle: CGFloat = 0.08
        /// A rectangle wins over an ellipse only if it doesn't fit much worse.
        static let rectangleOverEllipse: CGFloat = 1.4
        /// Below this ratio of long to short axis an ellipse is a circle, with no direction.
        static let roundness: CGFloat = 1.15
        /// A closed shape thinner than this, in points on screen or as a share of its length, is a
        /// line drawn there and back, not a shape. A triangle needs more height than a rectangle
        /// before it is believed, because a retraced line always has three "corners".
        static let thinnest: CGFloat = 12
        static let thinnestShare: CGFloat = 0.05
        static let thinnestTriangleShare: CGFloat = 0.1
    }

    /// The shape `stroke` (points on the page, in drawing order) is closest to, if any. `zoom` is
    /// how many screen points one page point covers: sizes that separate a shape from handwriting
    /// are judged as the user sees them, so a small shape drawn zoomed in still snaps.
    static func fit(_ stroke: [CGPoint], zoom: CGFloat = 1) -> Shape? {
        let drawn = length(of: stroke)
        let zoom = max(zoom, 0.01)
        guard stroke.count >= 2, drawn * zoom >= Limit.minimumLength else { return nil }
        let points = resample(stroke, count: Limit.sampleCount)
        guard let first = points.first, let last = points.last else { return nil }
        let chord = distance(first, last)
        let straightness = chord / drawn
        if straightness > Limit.straight {
            let bow = maximumDeviation(of: points, from: first, to: last) / max(chord, 1)
            return bow < Limit.lineBow ? line(from: first, to: last) : nil
        }
        return straightness < Limit.closed ? closedShape(points, zoom: zoom) : nil
    }

    // MARK: - Line

    private static func line(from start: CGPoint, to end: CGPoint) -> Shape {
        let angle = atan2(end.y - start.y, end.x - start.x)
        let nearest = (angle / (.pi / 2)).rounded() * (.pi / 2)
        guard abs(angle - nearest) < Limit.angleSnap else { return .line(start: start, end: end) }
        let reach = distance(start, end)
        return .line(start: start, end: CGPoint(x: start.x + cos(nearest) * reach, y: start.y + sin(nearest) * reach))
    }

    private static func maximumDeviation(of points: [CGPoint], from start: CGPoint, to end: CGPoint) -> CGFloat {
        let reach = max(distance(start, end), 0.0001)
        return points.reduce(0) { max($0, abs(cross(start, end, $1)) / reach) }
    }

    // MARK: - Closed shapes

    private static func closedShape(_ points: [CGPoint], zoom: CGFloat) -> Shape? {
        let center = centroid(of: points)
        let edges = edgeDirection(of: points)
        let rect = rectangle(points, center: center, rotation: edges.angle)
        let oval = ellipse(points, center: center)
        let rectangleLimit = edges.strength > Limit.clearEdges ? Limit.roundedRectangle : Limit.rectangle
        if edges.strength > Limit.edges, rect.residual < rectangleLimit,
            rect.residual <= oval.residual * Limit.rectangleOverEllipse {
            return isSliver(rect.shape, zoom: zoom) ? nil : rect.shape
        }
        if oval.residual < Limit.ellipse { return isSliver(oval.shape, zoom: zoom) ? nil : oval.shape }
        // Last, and only for what is neither: a rectangle or an oval also contains a large triangle.
        guard let cornered = triangle(points), cornered.residual < Limit.triangle else { return nil }
        return isSliver(cornered.shape, zoom: zoom) ? nil : cornered.shape
    }

    /// Whether a closed shape is too thin to be meant as one (see `Limit.thinnest`).
    private static func isSliver(_ shape: Shape, zoom: CGFloat) -> Bool {
        let long: CGFloat
        let short: CGFloat
        var share = Limit.thinnestShare
        switch shape {
        case let .rectangle(_, half, _):
            (long, short) = (max(half.width, half.height) * 2, min(half.width, half.height) * 2)
        case let .ellipse(_, radii, _):
            (long, short) = (max(radii.width, radii.height) * 2, min(radii.width, radii.height) * 2)
        case let .triangle(first, second, third):
            // Its longest side, and its height over that side.
            long = max(distance(first, second), distance(second, third), distance(third, first))
            short = abs(cross(first, second, third)) / max(long, 0.0001)
            share = Limit.thinnestTriangleShare
        case .line:
            return false
        }
        return short * zoom < Limit.thinnest || short < long * share
    }

    /// The direction a rectangle's sides run in. Side directions repeat every 90°, so angles are
    /// averaged four times over; `strength` is near 1 for a rectangle and near 0 for a circle.
    private static func edgeDirection(of points: [CGPoint]) -> (angle: CGFloat, strength: CGFloat) {
        var sumX: CGFloat = 0
        var sumY: CGFloat = 0
        var weight: CGFloat = 0
        for (start, end) in zip(points, points.dropFirst()) {
            let segment = distance(start, end)
            guard segment > 0 else { continue }
            let angle = atan2(end.y - start.y, end.x - start.x) * 4
            sumX += cos(angle) * segment
            sumY += sin(angle) * segment
            weight += segment
        }
        guard weight > 0 else { return (0, 0) }
        return (atan2(sumY, sumX) / 4, hypot(sumX, sumY) / weight)
    }

    private static func rectangle(
        _ points: [CGPoint], center: CGPoint, rotation: CGFloat
    ) -> (shape: Shape, residual: CGFloat) {
        let angle = snapped(rotation)
        let local = points.map { rotate($0, around: center, by: -angle) }
        let box = bounds(of: local)
        let half = CGSize(width: box.width / 2, height: box.height / 2)
        let middle = CGPoint(x: box.midX, y: box.midY)
        let scale = max((half.width + half.height) / 2, 1)
        let total = local.reduce(CGFloat(0)) { sum, point in
            let offsetX = abs(point.x - middle.x)
            let offsetY = abs(point.y - middle.y)
            // Distance to the nearest side of the box, from outside it or from inside.
            let outside = hypot(max(offsetX - half.width, 0), max(offsetY - half.height, 0))
            let inside = min(max(half.width - offsetX, 0), max(half.height - offsetY, 0))
            return sum + (outside > 0 ? outside : inside)
        }
        let worldCenter = rotate(middle, around: center, by: angle)
        return (.rectangle(center: worldCenter, half: half, rotation: angle), total / CGFloat(local.count) / scale)
    }

    private static func ellipse(_ points: [CGPoint], center: CGPoint) -> (shape: Shape, residual: CGFloat) {
        let axis = principalAxis(of: points, center: center)
        let angle = axis.elongation < Limit.roundness ? 0 : snapped(axis.angle)
        let local = points.map { rotate($0, around: center, by: -angle) }
        let box = bounds(of: local)
        let radii = CGSize(width: max(box.width / 2, 1), height: max(box.height / 2, 1))
        let middle = CGPoint(x: box.midX, y: box.midY)
        let total = local.reduce(CGFloat(0)) { sum, point in
            sum + abs(hypot((point.x - middle.x) / radii.width, (point.y - middle.y) / radii.height) - 1)
        }
        let worldCenter = rotate(middle, around: center, by: angle)
        return (.ellipse(center: worldCenter, radii: radii, rotation: angle), total / CGFloat(local.count))
    }

    private static func snapped(_ angle: CGFloat) -> CGFloat {
        let nearest = (angle / (.pi / 2)).rounded() * (.pi / 2)
        return abs(angle - nearest) < Limit.angleSnap ? nearest : angle
    }

    // MARK: - Geometry

    static func distance(_ first: CGPoint, _ second: CGPoint) -> CGFloat {
        hypot(second.x - first.x, second.y - first.y)
    }

    static func length(of points: [CGPoint]) -> CGFloat {
        zip(points, points.dropFirst()).reduce(0) { $0 + distance($1.0, $1.1) }
    }

    /// Twice the signed area of the triangle the three points span; also how far `point` lies to
    /// one side of the line from `start` to `end`, times that line's length.
    static func cross(_ start: CGPoint, _ end: CGPoint, _ point: CGPoint) -> CGFloat {
        (end.x - start.x) * (point.y - start.y) - (end.y - start.y) * (point.x - start.x)
    }

    /// The path again as `count` points the same distance apart.
    static func resample(_ points: [CGPoint], count: Int) -> [CGPoint] {
        guard let first = points.first, points.count > 1, count > 1 else { return points }
        let step = length(of: points) / CGFloat(count - 1)
        guard step > 0 else { return points }
        var result = [first]
        var carried: CGFloat = 0
        var previous = first
        for point in points.dropFirst() {
            var segment = distance(previous, point)
            while carried + segment >= step, result.count < count {
                let progress = (step - carried) / segment
                let next = CGPoint(
                    x: previous.x + (point.x - previous.x) * progress,
                    y: previous.y + (point.y - previous.y) * progress)
                result.append(next)
                segment -= step - carried
                carried = 0
                previous = next
            }
            carried += segment
            previous = point
        }
        if result.count < count, let last = points.last { result.append(last) }
        return result
    }

    static func centroid(of points: [CGPoint]) -> CGPoint {
        let sum = points.reduce(CGPoint.zero) { CGPoint(x: $0.x + $1.x, y: $0.y + $1.y) }
        let count = CGFloat(max(points.count, 1))
        return CGPoint(x: sum.x / count, y: sum.y / count)
    }

    static func bounds(of points: [CGPoint]) -> CGRect {
        points.reduce(CGRect.null) { $0.union(CGRect(origin: $1, size: .zero)) }
    }

    static func rotate(_ point: CGPoint, around center: CGPoint, by angle: CGFloat) -> CGPoint {
        let deltaX = point.x - center.x
        let deltaY = point.y - center.y
        return CGPoint(
            x: center.x + deltaX * cos(angle) - deltaY * sin(angle),
            y: center.y + deltaX * sin(angle) + deltaY * cos(angle))
    }

    /// The direction the points spread furthest in, and how much further than across it.
    static func principalAxis(of points: [CGPoint], center: CGPoint) -> (angle: CGFloat, elongation: CGFloat) {
        var covXX: CGFloat = 0
        var covYY: CGFloat = 0
        var covXY: CGFloat = 0
        for point in points {
            let deltaX = point.x - center.x
            let deltaY = point.y - center.y
            covXX += deltaX * deltaX
            covYY += deltaY * deltaY
            covXY += deltaX * deltaY
        }
        let mean = (covXX + covYY) / 2
        let spread = hypot((covXX - covYY) / 2, covXY)
        let minor = max(mean - spread, 0.0001)
        return (0.5 * atan2(2 * covXY, covXX - covYY), ((mean + spread) / minor).squareRoot())
    }
}
