/// Debounces saves: each change restarts the timer, so a burst of strokes costs one save.
/// Only one pending task exists at a time.
@MainActor
final class AutosaveScheduler {
    private let delay: Duration
    private let save: @MainActor () async -> Void
    private var pending: Task<Void, Never>?

    init(delay: Duration = .milliseconds(1500), save: @escaping @MainActor () async -> Void) {
        self.delay = delay
        self.save = save
    }

    var isPending: Bool {
        pending != nil
    }

    func changeHappened() {
        pending?.cancel()
        pending = Task { [delay, weak self] in
            try? await Task.sleep(for: delay)
            guard !Task.isCancelled, let self else { return }
            self.pending = nil
            await self.save()
        }
    }

    func cancel() {
        pending?.cancel()
        pending = nil
    }

    /// Saves now instead of waiting (app resigning active, view unmounting, page switch).
    func flush() async {
        guard pending != nil else { return }
        cancel()
        await save()
    }
}
