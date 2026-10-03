/// When to wake iOS's keyboard machinery ahead of the first lasso selection.
///
/// PencilKit's lasso makes its selection view first responder, and that view takes text input (it
/// offers Writing Tools), so iOS sets up its keyboard machinery at that moment even though no
/// keyboard shows. The first selection after launch held the main thread for about 275 ms on an iPad
/// Pro (Instruments); later ones take about 45 ms each, inside PencilKit. Doing the setup once while
/// nothing is happening brought the first selection down to about 114 ms.
enum KeyboardPrewarm {
    enum Decision: Equatable, Sendable {
        case run
        /// Something is in the way right now; look again shortly.
        case retry
        case skip
    }

    /// How many times to look before giving up for this page.
    static let maximumAttempts = 5

    /// - Parameters:
    ///   - alreadyDone: once per launch is enough.
    ///   - voiceOverRunning: a text field taking focus, even an invisible one, would be announced.
    ///   - toolInUse: a stroke, erase or lasso is in progress.
    ///   - textInputActive: the first responder takes text (a lasso selection, or a real text field),
    ///     so the machinery is already up, and stealing focus would drop the selection.
    static func decide(
        alreadyDone: Bool, voiceOverRunning: Bool, toolInUse: Bool, textInputActive: Bool
    ) -> Decision {
        if alreadyDone || voiceOverRunning || textInputActive { return .skip }
        return toolInUse ? .retry : .run
    }
}
