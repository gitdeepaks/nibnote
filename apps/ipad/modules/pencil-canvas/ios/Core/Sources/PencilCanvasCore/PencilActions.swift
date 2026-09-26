import UIKit

/// Names for the user's system-wide Apple Pencil preference (Settings → Apple Pencil).
/// Mirrors `PencilPreferredAction` in packages/shared/src/canvas.ts. JS decides what to do;
/// native only reports the gesture and what the user asked the system to do.
enum PencilActions {
    static func name(for action: UIPencilPreferredAction) -> String {
        switch action {
        case .ignore: "ignore"
        case .switchEraser: "switchEraser"
        case .switchPrevious: "switchPrevious"
        case .showColorPalette: "showColorPalette"
        case .showInkAttributes: "showInkAttributes"
        case .showContextualPalette: "showContextualPalette"
        case .runSystemShortcut: "runSystemShortcut"
        @unknown default: "ignore"
        }
    }
}
