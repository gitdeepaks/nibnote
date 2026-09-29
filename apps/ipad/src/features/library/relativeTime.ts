const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Short, human "edited …" text for library cards. */
export function relativeTime(then: number, now: number): string {
  const elapsed = Math.max(0, now - then);
  if (elapsed < MINUTE) return "just now";
  if (elapsed < HOUR) return `${String(Math.floor(elapsed / MINUTE))} min ago`;
  if (elapsed < DAY) return `${String(Math.floor(elapsed / HOUR))} h ago`;
  if (elapsed < 2 * DAY) return "yesterday";
  if (elapsed < 7 * DAY) return `${String(Math.floor(elapsed / DAY))} days ago`;
  return new Date(then).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
}
