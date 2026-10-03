import UIKit

/// Wakes iOS's keyboard machinery once per launch (see `KeyboardPrewarm` for why). An invisible text
/// field with an empty input view becomes first responder for a moment: nothing shows, no keyboard
/// and no shortcut bar, and whatever was first responder before gets it back. (A read-only text view,
/// closer to PencilKit's selection view, measured no better: 137 ms against 114 ms.)
@MainActor
enum KeyboardPrewarmer {
    private(set) static var isDone = false
    /// Long enough for iOS to finish setting up; resigning in the same turn would cut it short.
    private static let hold: Duration = .milliseconds(300)

    static func run(in window: UIWindow) async {
        isDone = true
        let previous = UIResponder.currentFirstResponder()
        let field = UITextField(frame: .zero)
        field.alpha = 0
        field.isAccessibilityElement = false
        field.accessibilityElementsHidden = true
        field.inputView = UIView()
        field.inputAssistantItem.leadingBarButtonGroups = []
        field.inputAssistantItem.trailingBarButtonGroups = []
        window.addSubview(field)
        field.becomeFirstResponder()
        try? await Task.sleep(for: hold)
        // Only hand focus back if nothing else took it meanwhile (a lasso selection, for example).
        if field.isFirstResponder {
            field.resignFirstResponder()
            previous?.becomeFirstResponder()
        }
        field.removeFromSuperview()
    }
}

extension UIResponder {
    private static weak var reported: UIResponder?

    /// The first responder, found by sending an action only this method handles down the chain.
    static func currentFirstResponder() -> UIResponder? {
        reported = nil
        UIApplication.shared.sendAction(#selector(reportAsFirstResponder), to: nil, from: nil, for: nil)
        return reported
    }

    @objc private func reportAsFirstResponder() {
        UIResponder.reported = self
    }
}
