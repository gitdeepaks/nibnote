import {
  DAILY_NOTEBOOK_TITLE,
  FolderId,
  HexColor,
  INBOX_FOLDER_NAME,
  NotebookId,
  ok,
  PAGE_SIZES,
  PageId,
  type LocalDate,
  type Notebook,
  type Page,
  type PageTemplate,
  type Result,
} from "@nibnote/shared";
import { and, asc, eq, isNull } from "drizzle-orm";
import { folders, notebooks, pages } from "../schema";
import { keyBetween } from "../sort-key";
import { insertNotebook } from "./notebooks";
import { enqueue } from "./outbox";
import { defaultShape, insertPage, livePages, slotKey } from "./pages";
import { toNotebook } from "./rows";
import type { Db, RepositoryDeps, RepositoryError } from "./types";

// One-tap capture: today's page in the Daily notebook, and a fresh Quick Note in the Inbox folder.
// Both create their notebook or folder on first use and again if it was trashed. System rows are
// found by role, never by name, so renaming them is safe. Roles aren't unique (two devices may each
// create one before syncing): the oldest live one wins, and Phase 5 merges the rest.

const BLANK: PageTemplate = { kind: "blank" };
const DAILY_COVER = HexColor.parse("#0F9D8A");
const QUICK_NOTE_COVER = HexColor.parse("#F4B400");

export type OpenedPage = { readonly notebookId: NotebookId; readonly pageId: PageId };

export function createCaptureQueries<R>(db: Db<R>, deps: RepositoryDeps) {
  return {
    /**
     * The Daily notebook's page for `date` (the device's local day), created at the end of the
     * notebook if it doesn't exist yet. Calling it again the same day returns the same page.
     */
    openDailyPage(date: LocalDate): Result<OpenedPage, RepositoryError> {
      return db.transaction((tx) => {
        const existing = tx
          .select()
          .from(notebooks)
          .where(and(eq(notebooks.role, "daily"), isNull(notebooks.deletedAt)))
          .orderBy(asc(notebooks.createdAt))
          .limit(1)
          .get();
        const notebook =
          existing ??
          insertNotebook(
            tx,
            deps,
            {
              title: DAILY_NOTEBOOK_TITLE,
              coverColor: DAILY_COVER,
              pageSize: PAGE_SIZES.a4Portrait,
              defaultTemplate: BLANK,
              folderId: null,
            },
            "daily",
          );
        const notebookId = NotebookId.parse(notebook.id);
        const today = tx
          .select({ id: pages.id })
          .from(pages)
          .where(and(eq(pages.notebookId, notebookId), eq(pages.dailyDate, date), isNull(pages.deletedAt)))
          .limit(1)
          .get();
        if (today !== undefined) return ok({ notebookId, pageId: PageId.parse(today.id) });
        const siblings = livePages(tx, notebookId);
        const pageId = PageId.parse(deps.newId());
        const sortKey = slotKey(tx, deps, siblings, siblings.length - 1, pageId);
        insertPage(tx, deps, notebookId, pageId, sortKey, defaultShape(notebook), date);
        return ok({ notebookId, pageId });
      });
    },

    /** A new one-page notebook in the Inbox folder, which is created (first in the list) if needed. */
    createQuickNote(title: string): Result<{ readonly notebook: Notebook; readonly firstPage: Page }, RepositoryError> {
      return db.transaction((tx) => {
        const inbox =
          tx
            .select({ id: folders.id })
            .from(folders)
            .where(and(eq(folders.role, "inbox"), isNull(folders.deletedAt)))
            .orderBy(asc(folders.createdAt))
            .limit(1)
            .get() ?? insertInbox(tx, deps);
        const notebook = insertNotebook(
          tx,
          deps,
          {
            title,
            coverColor: QUICK_NOTE_COVER,
            pageSize: PAGE_SIZES.a4Portrait,
            defaultTemplate: BLANK,
            folderId: FolderId.parse(inbox.id),
          },
          null,
        );
        const firstPage = insertPage(
          tx,
          deps,
          NotebookId.parse(notebook.id),
          PageId.parse(deps.newId()),
          keyBetween(null, null),
          defaultShape(notebook),
        );
        return ok({ notebook: toNotebook(notebook), firstPage });
      });
    },
  };
}

/** Creates the Inbox folder at the top of the folder list. */
function insertInbox<R>(tx: Db<R>, deps: RepositoryDeps): { readonly id: string } {
  const first = tx
    .select({ sortKey: folders.sortKey })
    .from(folders)
    .where(isNull(folders.parentId))
    .orderBy(asc(folders.sortKey))
    .limit(1)
    .get();
  const now = deps.now();
  const row = {
    id: deps.newId(),
    name: INBOX_FOLDER_NAME,
    parentId: null,
    sortKey: keyBetween(null, first?.sortKey ?? null),
    role: "inbox" as const,
    createdAt: now,
    updatedAt: now,
  };
  tx.insert(folders).values(row).run();
  enqueue(tx, deps, "folder", row.id, "upsert");
  return row;
}
