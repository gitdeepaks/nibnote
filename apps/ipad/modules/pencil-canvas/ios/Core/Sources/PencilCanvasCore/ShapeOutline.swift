import CoreGraphics

/// How a snapped shape is drawn: exact, or with a slight wobble as if by a steady hand.
enum ShapeLook: String, Sendable {
    case clean
    case handDrawn

    /// The furthest the hand-drawn look moves any point of a shape this big, in page points: a
    /// little over 1% of its size, never enough to look like a mistake.
    func wobble(for size: CGSize) -> CGFloat {
        switch self {
        case .clean: 0
        case .handDrawn: min(max(size.width, size.height, 20) * 0.012, 2.2)
        }
    }
}

/// The points a snapped shape's stroke runs through.
enum ShapeOutline {
    /// Points along the shape, close enough together that the stroke's curve follows them, with
    /// each corner repeated so it stays sharp (PencilKit paths are B-splines and round a single point).
    static func points(of shape: ShapeFit.Shape, look: ShapeLook, seed: UInt64, spacing: CGFloat = 3) -> [CGPoint] {
        let exact = exactPoints(of: shape, spacing: spacing)
        let amount = look.wobble(for: ShapeFit.bounds(of: exact).size)
        return amount > 0 ? handDrawn(exact, amount: amount, seed: seed) : exact
    }

    static func exactPoints(of shape: ShapeFit.Shape, spacing: CGFloat = 3) -> [CGPoint] {
        switch shape {
        case let .line(start, end):
            return polyline([start, end], spacing: spacing, closed: false)
        case let .triangle(first, second, third):
            return polyline([first, second, third], spacing: spacing, closed: true)
        case let .rectangle(center, half, rotation):
            let corners = [
                CGPoint(x: -half.width, y: -half.height), CGPoint(x: half.width, y: -half.height),
                CGPoint(x: half.width, y: half.height), CGPoint(x: -half.width, y: half.height)
            ].map { ShapeFit.rotate(CGPoint(x: center.x + $0.x, y: center.y + $0.y), around: center, by: rotation) }
            return polyline(corners, spacing: spacing, closed: true)
        case let .ellipse(center, radii, rotation):
            let around = 2 * CGFloat.pi * ((radii.width + radii.height) / 2)
            let steps = max(24, Int(around / spacing))
            // Two steps past the start, so the ends of the stroke overlap instead of leaving a gap.
            return (0...steps + 2).map { step in
                let angle = CGFloat(step) / CGFloat(steps) * 2 * .pi
                let point = CGPoint(x: center.x + cos(angle) * radii.width, y: center.y + sin(angle) * radii.height)
                return ShapeFit.rotate(point, around: center, by: rotation)
            }
        }
    }

    private static func polyline(_ corners: [CGPoint], spacing: CGFloat, closed: Bool) -> [CGPoint] {
        guard let first = corners.first else { return [] }
        let path = closed ? corners + [first] : corners
        var points: [CGPoint] = []
        for (start, end) in zip(path, path.dropFirst()) {
            let steps = max(1, Int(ShapeFit.distance(start, end) / spacing))
            // A repeated point pins the curve to the corner.
            points += [start, start, start]
            points += (1..<steps).map { step in
                let progress = CGFloat(step) / CGFloat(steps)
                return CGPoint(x: start.x + (end.x - start.x) * progress, y: start.y + (end.y - start.y) * progress)
            }
        }
        if let last = path.last { points += [last, last, last] }
        return points
    }

    /// The outline with a slow, slight wobble across it. Points that coincide (a pinned corner)
    /// move together, so corners stay sharp. `amount` is the furthest any point moves; the same
    /// `seed` always gives the same wobble, so a shape doesn't change when it is drawn again.
    static func handDrawn(_ outline: [CGPoint], amount: CGFloat, seed: UInt64) -> [CGPoint] {
        guard outline.count >= 3, amount > 0 else { return outline }
        let phases = [UInt64(1), 2].map { step -> CGFloat in
            let mixed = seed &* 6_364_136_223_846_793_005 &+ step &* 1_442_695_040_888_963_407
            return CGFloat((mixed >> 33) % 6283) / 1000
        }
        var travelled: CGFloat = 0
        return outline.indices.map { index in
            let point = outline[index]
            if index > 0 { travelled += ShapeFit.distance(outline[index - 1], point) }
            let before = outline[..<index].last { $0 != point } ?? point
            let after = outline[(index + 1)...].first { $0 != point } ?? point
            let reach = ShapeFit.distance(before, after)
            guard reach > 0 else { return point }
            // Two waves, about 120 and 45 points long, so it never visibly repeats.
            let wave = sin(travelled / 19 + phases[0]) * 0.6 + sin(travelled / 7 + phases[1]) * 0.4
            let push = wave * amount / reach
            return CGPoint(x: point.x - (after.y - before.y) * push, y: point.y + (after.x - before.x) * push)
        }
    }
}
