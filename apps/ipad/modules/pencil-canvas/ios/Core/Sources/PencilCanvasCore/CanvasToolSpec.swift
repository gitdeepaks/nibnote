import CoreGraphics

/// Ink types exposed to JS. Mirrors `InkType` in packages/shared/src/canvas.ts.
enum InkKind: String, CaseIterable, Sendable {
    case pen
    case fountainPen
    case pencil
    case marker
    case monoline
}

enum EraserMode: String, CaseIterable, Sendable {
    case stroke
    case pixel
}

/// An sRGB colour parsed from `#RRGGBB` or `#RRGGBBAA`.
struct RGBAColor: Equatable, Sendable {
    let red: CGFloat
    let green: CGFloat
    let blue: CGFloat
    let alpha: CGFloat

    init(red: CGFloat, green: CGFloat, blue: CGFloat, alpha: CGFloat) {
        self.red = red
        self.green = green
        self.blue = blue
        self.alpha = alpha
    }

    init?(hex: String) {
        guard hex.hasPrefix("#") else { return nil }
        let digits = hex.dropFirst()
        guard digits.count == 6 || digits.count == 8, let value = UInt64(digits, radix: 16) else { return nil }
        let hasAlpha = digits.count == 8
        let rgb = hasAlpha ? value >> 8 : value
        red = CGFloat((rgb >> 16) & 0xFF) / 255
        green = CGFloat((rgb >> 8) & 0xFF) / 255
        blue = CGFloat(rgb & 0xFF) / 255
        alpha = hasAlpha ? CGFloat(value & 0xFF) / 255 : 1
    }
}

/// The validated tool. Mirrors the `CanvasTool` discriminated union in packages/shared.
enum CanvasToolSpec: Equatable, Sendable {
    case ink(InkKind, color: RGBAColor, width: CGFloat)
    case highlighter(color: RGBAColor, width: CGFloat)
    case eraser(EraserMode, width: CGFloat)
    case lasso
}

/// Raw tool fields as they arrive over the bridge (a flat record with optional fields).
struct RawCanvasTool: Sendable {
    var kind: String
    var ink: String?
    var colorHex: String?
    var width: Double?
    var mode: String?
}

enum CanvasToolSpecError: Error, Equatable, Sendable {
    case unknownKind(String)
    case invalidField(String)
}

extension CanvasToolSpec {
    static let maxWidth: Double = 100

    static func parse(_ raw: RawCanvasTool) -> Result<CanvasToolSpec, CanvasToolSpecError> {
        switch raw.kind {
        case "ink":
            guard let ink = raw.ink.flatMap(InkKind.init(rawValue:)) else { return .failure(.invalidField("ink")) }
            return colorAndWidth(raw).map { .ink(ink, color: $0.color, width: $0.width) }
        case "highlighter":
            return colorAndWidth(raw).map { .highlighter(color: $0.color, width: $0.width) }
        case "eraser":
            guard let mode = raw.mode.flatMap(EraserMode.init(rawValue:)) else {
                return .failure(.invalidField("mode"))
            }
            return width(raw).map { .eraser(mode, width: $0) }
        case "lasso":
            return .success(.lasso)
        default:
            return .failure(.unknownKind(raw.kind))
        }
    }

    private static func colorAndWidth(
        _ raw: RawCanvasTool
    ) -> Result<(color: RGBAColor, width: CGFloat), CanvasToolSpecError> {
        guard let color = raw.colorHex.flatMap(RGBAColor.init(hex:)) else {
            return .failure(.invalidField("colorHex"))
        }
        return width(raw).map { (color: color, width: $0) }
    }

    private static func width(_ raw: RawCanvasTool) -> Result<CGFloat, CanvasToolSpecError> {
        guard let width = raw.width, width.isFinite, width > 0, width <= maxWidth else {
            return .failure(.invalidField("width"))
        }
        return .success(CGFloat(width))
    }
}
