import CoreGraphics
import QuartzCore

/// Page background pattern. Mirrors `PageTemplate` in packages/shared/src/canvas.ts.
enum PageTemplateSpec: Equatable, Sendable {
    case blank
    case lined(spacing: CGFloat)
    case grid(spacing: CGFloat)
    case dotted(spacing: CGFloat)
    case cornell

    static let spacingRange: ClosedRange<Double> = 4...200

    static func parse(kind: String, spacingPt: Double?) -> PageTemplateSpec? {
        switch kind {
        case "blank": return .blank
        case "cornell": return .cornell
        case "lined", "grid", "dotted":
            guard let spacingPt, spacingPt.isFinite, spacingRange.contains(spacingPt) else { return nil }
            let spacing = CGFloat(spacingPt)
            if kind == "lined" { return .lined(spacing: spacing) }
            return kind == "grid" ? .grid(spacing: spacing) : .dotted(spacing: spacing)
        default: return nil
        }
    }
}

/// Draws a page template in page coordinates (points). Only the part inside `clip` is drawn,
/// so the same code serves full-page thumbnails and small zoomed-in tiles.
enum TemplateRenderer {
    static let paper = CGColor(srgbRed: 1, green: 1, blue: 1, alpha: 1)
    static let ruleColor = CGColor(srgbRed: 0.62, green: 0.74, blue: 0.9, alpha: 0.9)
    static let gridColor = CGColor(srgbRed: 0.82, green: 0.84, blue: 0.87, alpha: 1)
    static let dotColor = CGColor(srgbRed: 0.6, green: 0.63, blue: 0.68, alpha: 1)
    static let lineWidth: CGFloat = 0.75
    static let dotRadius: CGFloat = 0.9
    static let cornellRuleSpacing: CGFloat = 24

    /// Evenly spaced horizontal lines from `start` to `end`, spanning the page width.
    struct HorizontalRules {
        let start: CGFloat
        let end: CGFloat
        let spacing: CGFloat
        let color: CGColor
    }

    static func draw(_ template: PageTemplateSpec, pageSize: CGSize, in context: CGContext, clip: CGRect) {
        let page = CGRect(origin: .zero, size: pageSize)
        let area = page.intersection(clip)
        guard !area.isNull, !area.isEmpty else { return }
        context.saveGState()
        defer { context.restoreGState() }
        context.setFillColor(paper)
        context.fill(area)
        context.setLineWidth(lineWidth)

        switch template {
        case .blank:
            return
        case let .lined(spacing):
            let rules = HorizontalRules(
                start: spacing * 3, end: page.maxY - spacing, spacing: spacing, color: ruleColor)
            horizontalRules(rules, page: page, area: area, in: context)
        case let .grid(spacing):
            let rules = HorizontalRules(start: spacing, end: page.maxY, spacing: spacing, color: gridColor)
            horizontalRules(rules, page: page, area: area, in: context)
            verticalRules(spacing: spacing, page: page, area: area, in: context)
        case let .dotted(spacing):
            dots(spacing: spacing, page: page, area: area, in: context)
        case .cornell:
            cornell(page: page, area: area, in: context)
        }
    }

    /// Index range of multiples of `spacing` (starting at `start`) that fall inside `low...high`.
    static func steps(
        start: CGFloat, end: CGFloat, spacing: CGFloat, low: CGFloat, high: CGFloat
    ) -> ClosedRange<Int>? {
        guard spacing > 0, end >= start else { return nil }
        let first = max(0, Int(((low - start) / spacing).rounded(.up)))
        let last = Int(((min(end, high) - start) / spacing).rounded(.down))
        return first <= last ? first...last : nil
    }

    private static func horizontalRules(_ rules: HorizontalRules, page: CGRect, area: CGRect, in context: CGContext) {
        guard
            let range = steps(
                start: rules.start, end: rules.end, spacing: rules.spacing, low: area.minY, high: area.maxY)
        else { return }
        context.setStrokeColor(rules.color)
        for index in range {
            let lineY = rules.start + CGFloat(index) * rules.spacing
            context.move(to: CGPoint(x: max(page.minX, area.minX), y: lineY))
            context.addLine(to: CGPoint(x: min(page.maxX, area.maxX), y: lineY))
        }
        context.strokePath()
    }

    private static func verticalRules(spacing: CGFloat, page: CGRect, area: CGRect, in context: CGContext) {
        guard
            let range = steps(start: spacing, end: page.maxX, spacing: spacing, low: area.minX, high: area.maxX)
        else { return }
        context.setStrokeColor(gridColor)
        for index in range {
            let lineX = spacing + CGFloat(index) * spacing
            context.move(to: CGPoint(x: lineX, y: area.minY))
            context.addLine(to: CGPoint(x: lineX, y: area.maxY))
        }
        context.strokePath()
    }

    private static func dots(spacing: CGFloat, page: CGRect, area: CGRect, in context: CGContext) {
        let pad = dotRadius
        guard
            let rows = steps(
                start: spacing, end: page.maxY, spacing: spacing, low: area.minY - pad, high: area.maxY + pad),
            let columns = steps(
                start: spacing, end: page.maxX, spacing: spacing, low: area.minX - pad, high: area.maxX + pad)
        else { return }
        context.setFillColor(dotColor)
        for row in rows {
            for column in columns {
                let center = CGPoint(x: spacing + CGFloat(column) * spacing, y: spacing + CGFloat(row) * spacing)
                context.addEllipse(in: CGRect(x: center.x - pad, y: center.y - pad, width: pad * 2, height: pad * 2))
            }
        }
        context.fillPath()
    }

    /// Cornell layout: cue column (30% width) on the left, summary band (18% height) at the bottom,
    /// ruled lines across the notes area.
    private static func cornell(page: CGRect, area: CGRect, in context: CGContext) {
        let cueX = (page.width * 0.3).rounded()
        let summaryY = (page.height * 0.82).rounded()
        let rules = HorizontalRules(
            start: cornellRuleSpacing * 3, end: summaryY - cornellRuleSpacing, spacing: cornellRuleSpacing,
            color: ruleColor)
        horizontalRules(rules, page: page, area: area, in: context)
        context.setStrokeColor(ruleColor)
        context.setLineWidth(lineWidth * 2)
        context.move(to: CGPoint(x: cueX, y: 0))
        context.addLine(to: CGPoint(x: cueX, y: summaryY))
        context.move(to: CGPoint(x: 0, y: summaryY))
        context.addLine(to: CGPoint(x: page.maxX, y: summaryY))
        context.strokePath()
    }
}

/// Draws template tiles for a `CATiledLayer`. Tiles are rendered on background threads,
/// so this delegate is immutable and `Sendable`; a template change installs a new drawer.
final class TemplateTileDrawer: NSObject, CALayerDelegate, Sendable {
    let template: PageTemplateSpec
    let pageSize: CGSize

    init(template: PageTemplateSpec, pageSize: CGSize) {
        self.template = template
        self.pageSize = pageSize
    }

    nonisolated func draw(_ layer: CALayer, in context: CGContext) {
        TemplateRenderer.draw(template, pageSize: pageSize, in: context, clip: context.boundingBoxOfClipPath)
    }
}
