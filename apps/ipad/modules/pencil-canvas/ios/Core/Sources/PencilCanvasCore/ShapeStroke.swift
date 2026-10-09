import PencilKit

/// A recognised shape as a PencilKit stroke that looks like the stroke it replaces.
enum ShapeStroke {
    /// How far apart points are taken along a stroke: about 3 points on screen, so a small shape
    /// drawn zoomed in has as many points as a large one, and never finer than PencilKit resolves.
    static func spacing(zoom: CGFloat) -> CGFloat {
        min(max(3 / max(zoom, 0.01), 0.75), 3)
    }

    /// The stroke's points on the page (its path with its transform applied).
    static func pagePoints(of stroke: PKStroke, zoom: CGFloat) -> [CGPoint] {
        stroke.path.interpolatedPoints(by: .distance(spacing(zoom: zoom))).map {
            $0.location.applying(stroke.transform)
        }
    }

    /// A stroke along `shape` with the look of `original`: its ink, and the size, opacity and tilt
    /// of a point from the middle of it (the ends of a hand stroke taper). It keeps the original's
    /// random seed, so a pencil's grain looks the same, and its date, so the result is repeatable.
    static func make(_ shape: ShapeFit.Shape, like original: PKStroke, look: ShapeLook, zoom: CGFloat) -> PKStroke {
        guard !original.path.isEmpty else { return original }
        let sample = original.path[original.path.count / 2]
        let outline = ShapeOutline.points(
            of: shape, look: look, seed: UInt64(original.randomSeed), spacing: spacing(zoom: zoom))
        let points = outline.enumerated().map { index, location in
            PKStrokePoint(
                location: location, timeOffset: TimeInterval(index) * 0.004, size: sample.size,
                opacity: sample.opacity, force: sample.force, azimuth: sample.azimuth, altitude: sample.altitude,
                secondaryScale: sample.secondaryScale, threshold: sample.threshold)
        }
        let path = PKStrokePath(controlPoints: points, creationDate: original.path.creationDate)
        return PKStroke(ink: original.ink, path: path, transform: .identity, mask: nil, randomSeed: original.randomSeed)
    }
}
