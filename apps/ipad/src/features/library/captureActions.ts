import type { Repository } from "@nibnote/db";
import { localDateOf } from "@nibnote/shared";
import { router } from "expo-router";
import { reportFailure } from "../../db/reportFailure";

// One-tap capture from the library: today's Daily page, or a fresh Quick Note in the Inbox.

const quickNoteTime = new Intl.DateTimeFormat([], {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});

/** Opens (creating if needed) the Daily page for the device's current local day. */
export function openToday(repository: Repository): void {
  const result = repository.capture.openDailyPage(localDateOf(new Date()));
  if (!reportFailure(result, "open today's page")) return;
  router.push({
    pathname: "/notebook/[notebookId]",
    params: { notebookId: result.value.notebookId, page: result.value.pageId },
  });
}

/** Creates a new one-page notebook in the Inbox and opens it. */
export function startQuickNote(repository: Repository): void {
  const result = repository.capture.createQuickNote(`Quick Note · ${quickNoteTime.format(new Date())}`);
  if (!reportFailure(result, "create a quick note")) return;
  router.push({ pathname: "/notebook/[notebookId]", params: { notebookId: result.value.notebook.id } });
}
