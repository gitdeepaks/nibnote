import type { NotebookId } from "@nibnote/shared";

// Measures "tap a notebook → its page is on the canvas" for the Phase 2 exit criterion (a 300-page
// notebook opens in under a second). Started by a library card press, stopped by the canvas's
// first report for that notebook's page. Only shown in the diagnostics menu.

const timing: { start: { notebookId: NotebookId; at: number } | null; lastMs: number | null } = {
  start: null,
  lastMs: null,
};

export function startOpenTimer(notebookId: NotebookId): void {
  timing.start = { notebookId, at: performance.now() };
}

/** Called when the canvas reports its first page; ignored unless a timed open is in flight. */
export function stopOpenTimer(notebookId: NotebookId): void {
  if (timing.start?.notebookId !== notebookId) return;
  timing.lastMs = Math.round(performance.now() - timing.start.at);
  timing.start = null;
  console.log(`Notebook opened in ${String(timing.lastMs)} ms`);
}

export function lastOpenMs(): number | null {
  return timing.lastMs;
}
