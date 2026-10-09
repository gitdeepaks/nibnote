import CoreGraphics

/// Hand-drawn-like inputs for the shape tests: every point wobbles a little, the same way each run.
enum ShapeSamples {
    /// A repeatable wobble of up to `amount` points, like a hand.
    static func wobble(_ index: Int, _ amount: CGFloat) -> CGPoint {
        CGPoint(x: sin(CGFloat(index) * 1.7) * amount, y: cos(CGFloat(index) * 2.3) * amount)
    }

    /// A path through `corners`, 20 wobbling points per side.
    static func path(through corners: [CGPoint], wobble amount: CGFloat = 3) -> [CGPoint] {
        var points: [CGPoint] = []
        for (index, pair) in zip(corners, corners.dropFirst()).enumerated() {
            points += (0..<20).map { step in
                let progress = CGFloat(step) / 20
                let shake = wobble(index * 20 + step, amount)
                return CGPoint(
                    x: pair.0.x + (pair.1.x - pair.0.x) * progress + shake.x,
                    y: pair.0.y + (pair.1.y - pair.0.y) * progress + shake.y)
            }
        }
        return points
    }

    static func line(from start: CGPoint, to end: CGPoint, wobble amount: CGFloat = 2) -> [CGPoint] {
        path(through: [start, end], wobble: amount) + [end]
    }

    /// `turns` a little over 1 overlaps the ends, as a hand does when it closes a circle.
    static func oval(center: CGPoint, radii: CGSize, wobble amount: CGFloat = 3, turns: CGFloat = 1.03) -> [CGPoint] {
        (0...80).map { step in
            let angle = CGFloat(step) / 80 * 2 * .pi * turns
            let shake = wobble(step, amount)
            return CGPoint(
                x: center.x + cos(angle) * radii.width + shake.x, y: center.y + sin(angle) * radii.height + shake.y)
        }
    }

    static func box(_ rect: CGRect, wobble amount: CGFloat = 3) -> [CGPoint] {
        let start = CGPoint(x: rect.minX, y: rect.minY)
        return path(
            through: [
                start, CGPoint(x: rect.maxX, y: rect.minY), CGPoint(x: rect.maxX, y: rect.maxY),
                CGPoint(x: rect.minX, y: rect.maxY), start
            ], wobble: amount)
    }

    /// A box whose corners are cut by `radius`, the way a quick hand rounds them.
    static func roundedBox(_ rect: CGRect, radius: CGFloat) -> [CGPoint] {
        var points: [CGPoint] = []
        let inner = rect.insetBy(dx: radius, dy: radius)
        let corners = [
            (CGPoint(x: inner.maxX, y: inner.minY), -CGFloat.pi / 2), (CGPoint(x: inner.maxX, y: inner.maxY), 0),
            (CGPoint(x: inner.minX, y: inner.maxY), CGFloat.pi / 2), (CGPoint(x: inner.minX, y: inner.minY), CGFloat.pi)
        ]
        for (center, from) in corners {
            points += (0...6).map { step in
                let angle = from + CGFloat(step) / 6 * .pi / 2
                return CGPoint(x: center.x + cos(angle) * radius, y: center.y + sin(angle) * radius)
            }
        }
        guard let first = points.first else { return [] }
        // Straight sides between the corner arcs, sampled like a drawn stroke.
        return zip(points, points.dropFirst() + [first]).flatMap { start, end in
            (0..<8).map { step in
                let progress = CGFloat(step) / 8
                return CGPoint(x: start.x + (end.x - start.x) * progress, y: start.y + (end.y - start.y) * progress)
            }
        } + [first]
    }
}
