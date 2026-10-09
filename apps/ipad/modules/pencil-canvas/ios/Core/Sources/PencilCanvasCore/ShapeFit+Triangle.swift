import CoreGraphics

/// The one shape found by its corners instead of by a formula.
extension ShapeFit {
    private typealias FittedLine = (point: CGPoint, direction: CGPoint)

    /// The triangle a closed stroke is nearest to, and how far the stroke is from it on average,
    /// as a share of the stroke's size.
    static func triangle(_ points: [CGPoint]) -> (shape: Shape, residual: CGFloat)? {
        let box = bounds(of: points)
        let scale = max((box.width + box.height) / 4, 1)
        guard let rough = largestTriangle(in: points) else { return nil }
        let corners = sharpened(rough, in: points, limit: scale * 0.35)
        let sides = [(corners[0], corners[1]), (corners[1], corners[2]), (corners[2], corners[0])]
        let total = points.reduce(CGFloat(0)) { sum, point in
            sum + (sides.map { distance(from: point, toSegment: $0.0, $0.1) }.min() ?? 0)
        }
        return (.triangle(corners[0], corners[1], corners[2]), total / CGFloat(points.count) / scale)
    }

    /// The three of the stroke's points that span the largest triangle, in drawing order. Its
    /// corners always lie on the convex hull, so only the hull is searched: a triangle-like stroke
    /// has few hull points, which keeps this well under a millisecond.
    private static func largestTriangle(in points: [CGPoint]) -> [Int]? {
        var candidates = hull(of: points)
        // A round stroke puts every point on the hull; it won't pass as a triangle, so half is plenty.
        if candidates.count > 32 {
            candidates = candidates.enumerated().filter { $0.offset.isMultiple(of: 2) }.map(\.element)
        }
        var largest: CGFloat = 0
        var corners: [Int]?
        for (position, first) in candidates.enumerated() {
            for (offset, second) in candidates[(position + 1)...].enumerated() {
                for third in candidates[(position + offset + 2)...] {
                    let size = abs(cross(points[first], points[second], points[third]))
                    if size > largest {
                        largest = size
                        corners = [first, second, third]
                    }
                }
            }
        }
        return corners
    }

    /// The indexes of the points on the convex hull, in drawing order (Andrew's monotone chain).
    private static func hull(of points: [CGPoint]) -> [Int] {
        let order = points.indices.sorted { (points[$0].x, points[$0].y) < (points[$1].x, points[$1].y) }
        guard order.count >= 3 else { return order.sorted() }
        func chain(_ indexes: [Int]) -> [Int] {
            var kept: [Int] = []
            for index in indexes {
                while kept.count >= 2,
                    cross(points[kept[kept.count - 2]], points[kept[kept.count - 1]], points[index]) <= 0 {
                    kept.removeLast()
                }
                kept.append(index)
            }
            return kept
        }
        return Set(chain(order) + chain(order.reversed())).sorted()
    }

    /// A hand rounds its corners, so each corner moves to where the straight sides on both sides of
    /// it would meet. A corner whose sides don't give a sensible meeting point stays where it is.
    private static func sharpened(_ corners: [Int], in points: [CGPoint], limit: CGFloat) -> [CGPoint] {
        let sides = [
            Array(points[corners[0]...corners[1]]), Array(points[corners[1]...corners[2]]),
            Array(points[corners[2]...]) + Array(points[...corners[0]])
        ].map(fittedLine)
        return corners.indices.map { index in
            let drawn = points[corners[index]]
            guard let incoming = sides[(index + 2) % 3], let outgoing = sides[index],
                let meeting = intersection(incoming, outgoing), distance(meeting, drawn) < limit
            else { return drawn }
            return meeting
        }
    }

    /// The straight line through the middle of one side; its ends are left out because they curve
    /// into the corners.
    private static func fittedLine(_ side: [CGPoint]) -> FittedLine? {
        let trim = side.count * 15 / 100
        let middle = Array(side.dropFirst(trim).dropLast(trim))
        guard middle.count >= 3 else { return nil }
        let center = centroid(of: middle)
        let angle = principalAxis(of: middle, center: center).angle
        return (center, CGPoint(x: cos(angle), y: sin(angle)))
    }

    private static func intersection(_ first: FittedLine, _ second: FittedLine) -> CGPoint? {
        let denominator = first.direction.x * second.direction.y - first.direction.y * second.direction.x
        // Nearly parallel sides meet too far away to trust.
        guard abs(denominator) > 0.2 else { return nil }
        let deltaX = second.point.x - first.point.x
        let deltaY = second.point.y - first.point.y
        let along = (deltaX * second.direction.y - deltaY * second.direction.x) / denominator
        return CGPoint(x: first.point.x + first.direction.x * along, y: first.point.y + first.direction.y * along)
    }

    private static func distance(from point: CGPoint, toSegment start: CGPoint, _ end: CGPoint) -> CGFloat {
        let deltaX = end.x - start.x
        let deltaY = end.y - start.y
        let lengthSquared = max(deltaX * deltaX + deltaY * deltaY, 0.0001)
        let along = min(max(((point.x - start.x) * deltaX + (point.y - start.y) * deltaY) / lengthSquared, 0), 1)
        return hypot(point.x - (start.x + deltaX * along), point.y - (start.y + deltaY * along))
    }
}
