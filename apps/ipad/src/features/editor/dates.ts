import type { LocalDate } from "@nibnote/shared";

const dayFormat = new Intl.DateTimeFormat([], {
  weekday: "short",
  day: "numeric",
  month: "short",
});

/** A Daily page's day, like "Mon, 28 Sep", in the user's locale. */
export function formatLocalDate(date: LocalDate): string {
  const [year, month, day] = date.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) return date;
  return dayFormat.format(new Date(year, month - 1, day));
}
