import {
  err,
  NotebookId,
  ok,
  PageId,
  PageSize,
  type LocalDate,
  type Page,
  type RelativePath,
  type Result,
} from "@nibnote/shared";
import { and, asc, count, desc, eq, inArray, isNull } from "drizzle-orm";
import { drawingPathFor, thumbnailPathFor } from "../paths";
import { notebooks, pages } from "../schema";
import { evenlySpacedKeys, keyBetween, needsRebalance } from "../sort-key";
import { enqueue } from "./outbox";
import { createSettingsQueries } from "./settings";
import { toPage } from "./rows";
import type { Db, RepositoryDeps, RepositoryError } from "./types";

type NotebookRow = typeof notebooks.$inferSelect;
type PageRow = typeof pages.$inferSelect;

/** Where a moved page goes: directly after `afterId`, or first when `afterId` is null. */
export type PagePlacement = { readonly afterId: PageId | null };

/** A duplicated page's drawing must be copied by the caller (file I/O lives in the app). */
export type DuplicatedPage = {
  readonly page: Page;
  readonly sourceId: PageId;
  readonly copyFrom: RelativePath;
  readonly copyTo: RelativePath;
};

type PageShape = { readonly template: string; readonly widthPt: number; readonly heightPt: number };

export function livePages<R>(db: Db<R>, notebookId: string): PageRow[] {
  return db
    .select()
    .from(pages)
    .where(and(eq(pages.notebookId, notebookId), isNull(pages.deletedAt)))
    .orderBy(asc(pages.sortKey))
    .all();
}

/** The notebook's default template and size, for a new blank page. */
export function defaultShape(notebook: NotebookRow): PageShape {
  const size = PageSize.parse(JSON.parse(notebook.pageSize));
  return { template: notebook.defaultTemplate, widthPt: size.widthPt, heightPt: size.heightPt };
}

/**
 * Sort key for a slot right after `siblings[index]` (index -1 = first). When keys have grown too
 * long, every sibling is rewritten with fresh keys and the slot's new key is returned; the caller
 * writes the moving or new row itself.
 */
export function slotKey<R>(
  tx: Db<R>,
  deps: RepositoryDeps,
  siblings: readonly Pick<PageRow, "id" | "sortKey">[],
  index: number,
  movingId: string,
): string {
  const before = index < 0 ? null : (siblings[index]?.sortKey ?? null);
  const after = siblings[index + 1]?.sortKey ?? null;
  const key = keyBetween(before, after);
  if (!needsRebalance(key)) return key;
  const order = siblings.map((sibling) => sibling.id);
  order.splice(index + 1, 0, movingId);
  const keys = evenlySpacedKeys(order.length);
  const now = deps.now();
  order.forEach((id, position) => {
    const sortKey = keys[position];
    if (id === movingId || sortKey === undefined) return;
    tx.update(pages).set({ sortKey, updatedAt: now, isDirty: true }).where(eq(pages.id, id)).run();
    enqueue(tx, deps, "page", id, "upsert");
  });
  return keys[index + 1] ?? key;
}

/** Inserts a blank page. Call inside a transaction. */
export function insertPage<R>(
  tx: Db<R>,
  deps: RepositoryDeps,
  notebookId: NotebookId,
  pageId: PageId,
  sortKey: string,
  shape: PageShape,
  /** Only for the Daily notebook's page for that day; null for every other page (copies included). */
  dailyDate: LocalDate | null,
): Page {
  const now = deps.now();
  const row = {
    id: pageId,
    notebookId,
    sortKey,
    template: shape.template,
    widthPt: shape.widthPt,
    heightPt: shape.heightPt,
    drawingPath: drawingPathFor(notebookId, pageId),
    dailyDate,
    createdAt: now,
    updatedAt: now,
  };
  tx.insert(pages).values(row).run();
  enqueue(tx, deps, "page", pageId, "upsert");
  return toPage({
    ...row,
    drawingHash: null,
    thumbnailPath: null,
    recognizedText: null,
    deletedAt: null,
    serverVersion: 0,
    isDirty: true,
  });
}

/** Device-local memory of the page each notebook was left on. */
const lastPageKey = (notebookId: NotebookId) => `lastPage:${notebookId}`;
const RememberedPage = PageId.nullable();

export function createPageQueries<R>(db: Db<R>, deps: RepositoryDeps) {
  const preferences = createSettingsQueries(db);
  const findLive = (tx: Db<R>, pageId: PageId) =>
    tx
      .select()
      .from(pages)
      .where(and(eq(pages.id, pageId), isNull(pages.deletedAt)))
      .get();

  const findLiveNotebook = (tx: Db<R>, notebookId: string) =>
    tx
      .select()
      .from(notebooks)
      .where(and(eq(notebooks.id, notebookId), isNull(notebooks.deletedAt)))
      .get();

  const duplicateIn = (tx: Db<R>, source: PageRow): DuplicatedPage => {
    const siblings = livePages(tx, source.notebookId);
    const index = siblings.findIndex((page) => page.id === source.id);
    const copyId = PageId.parse(deps.newId());
    const sortKey = slotKey(tx, deps, siblings, index, copyId);
    const page = insertPage(tx, deps, NotebookId.parse(source.notebookId), copyId, sortKey, source, null);
    return { page, sourceId: PageId.parse(source.id), copyFrom: toPage(source).drawingPath, copyTo: page.drawingPath };
  };

  /** Live pages of one notebook, in page order; any missing page or a mix of notebooks is an error. */
  const liveSelection = (
    tx: Db<R>,
    pageIds: readonly PageId[],
  ): Result<{ readonly rows: PageRow[]; readonly notebookId: string }, RepositoryError> => {
    const wanted = new Set(pageIds);
    const firstId = pageIds[0];
    if (firstId === undefined) return err({ code: "notFound", entity: "page" });
    const first = findLive(tx, firstId);
    if (first === undefined) return err({ code: "notFound", entity: "page" });
    const rows = livePages(tx, first.notebookId).filter((page) => wanted.has(PageId.parse(page.id)));
    if (rows.length !== wanted.size) return err({ code: "notFound", entity: "page" });
    return ok({ rows, notebookId: first.notebookId });
  };

  return {
    list(notebookId: NotebookId): Page[] {
      return livePages(db, notebookId).map(toPage);
    },

    /**
     * The page to open a notebook on: `requested` (a deep link or the Daily note) when it is a live
     * page of this notebook, else the page it was left on, else its first page. Null only when the
     * notebook has no live pages.
     */
    openingPage(notebookId: NotebookId, requested: PageId | null): Page | null {
      const live = livePages(db, notebookId);
      const remembered = preferences.get(lastPageKey(notebookId), RememberedPage, null);
      const row = live.find((page) => page.id === requested) ?? live.find((page) => page.id === remembered) ?? live[0];
      return row === undefined ? null : toPage(row);
    },

    /** Remembers the page on screen. Device-local, like `markOpened`: no outbox entry. */
    rememberOpenPage(notebookId: NotebookId, pageId: PageId): void {
      preferences.set(lastPageKey(notebookId), RememberedPage, pageId);
    },

    /** Live page counts for every notebook, in one grouped query (no N+1 for the library grid). */
    countsByNotebook(): ReadonlyMap<NotebookId, number> {
      const rows = db
        .select({ notebookId: pages.notebookId, value: count() })
        .from(pages)
        .where(isNull(pages.deletedAt))
        .groupBy(pages.notebookId)
        .all();
      return new Map(rows.map((row) => [NotebookId.parse(row.notebookId), row.value]));
    },

    /** Adds a blank page after `afterId`, or at the end when it is null. */
    add(notebookId: NotebookId, afterId: PageId | null): Result<Page, RepositoryError> {
      return db.transaction((tx) => {
        const notebook = findLiveNotebook(tx, notebookId);
        if (notebook === undefined) return err({ code: "notFound", entity: "notebook" });
        const siblings = livePages(tx, notebookId);
        const index = afterId === null ? siblings.length - 1 : siblings.findIndex((page) => page.id === afterId);
        if (afterId !== null && index < 0) return err({ code: "notFound", entity: "page" });
        const pageId = PageId.parse(deps.newId());
        const sortKey = slotKey(tx, deps, siblings, index, pageId);
        return ok(insertPage(tx, deps, notebookId, pageId, sortKey, defaultShape(notebook), null));
      });
    },

    /** Copies a page's template and size right after it; the caller copies the drawing file. */
    duplicate(pageId: PageId): Result<DuplicatedPage, RepositoryError> {
      return db.transaction((tx) => {
        const source = findLive(tx, pageId);
        return source === undefined ? err({ code: "notFound", entity: "page" }) : ok(duplicateIn(tx, source));
      });
    },

    /** Duplicates several pages of one notebook, each copy right after its source, in one transaction. */
    duplicateMany(pageIds: readonly PageId[]): Result<DuplicatedPage[], RepositoryError> {
      return db.transaction((tx) => {
        const selection = liveSelection(tx, pageIds);
        return selection.ok ? ok(selection.value.rows.map((source) => duplicateIn(tx, source))) : selection;
      });
    },

    /** Trashes several pages of one notebook at once; the notebook must keep at least one page. */
    trashMany(pageIds: readonly PageId[]): Result<Page[], RepositoryError> {
      return db.transaction((tx) => {
        const selection = liveSelection(tx, pageIds);
        if (!selection.ok) return selection;
        const { rows, notebookId } = selection.value;
        if (livePages(tx, notebookId).length - rows.length < 1) return err({ code: "lastPage" });
        const now = deps.now();
        return ok(
          rows.map((row) => {
            tx.update(pages).set({ deletedAt: now, updatedAt: now, isDirty: true }).where(eq(pages.id, row.id)).run();
            enqueue(tx, deps, "page", row.id, "upsert");
            return toPage({ ...row, deletedAt: now, updatedAt: now, isDirty: true });
          }),
        );
      });
    },

    /**
     * Moves pages to the end of another notebook, keeping their order. Each page keeps its own
     * size and its drawing file where it is (paths are stored per page). The source notebook must
     * keep at least one page.
     */
    moveToNotebook(pageIds: readonly PageId[], targetId: NotebookId): Result<Page[], RepositoryError> {
      return db.transaction((tx) => {
        if (findLiveNotebook(tx, targetId) === undefined) return err({ code: "notFound", entity: "notebook" });
        const selection = liveSelection(tx, pageIds);
        if (!selection.ok) return selection;
        const { rows, notebookId } = selection.value;
        if (notebookId === targetId) return ok(rows.map(toPage));
        if (livePages(tx, notebookId).length - rows.length < 1) return err({ code: "lastPage" });
        const now = deps.now();
        const moved = rows.map((row) => {
          const siblings = livePages(tx, targetId);
          const sortKey = slotKey(tx, deps, siblings, siblings.length - 1, row.id);
          const changes = { notebookId: targetId, sortKey, updatedAt: now, isDirty: true };
          tx.update(pages).set(changes).where(eq(pages.id, row.id)).run();
          enqueue(tx, deps, "page", row.id, "upsert");
          return toPage({ ...row, ...changes });
        });
        // Both notebooks changed content, so both move up the library (no notebook outbox entry).
        tx.update(notebooks)
          .set({ updatedAt: now })
          .where(inArray(notebooks.id, [notebookId, targetId]))
          .run();
        return ok(moved);
      });
    },

    move(pageId: PageId, placement: PagePlacement): Result<Page, RepositoryError> {
      return db.transaction((tx) => {
        const moving = findLive(tx, pageId);
        if (moving === undefined) return err({ code: "notFound", entity: "page" });
        const siblings = livePages(tx, moving.notebookId).filter((page) => page.id !== pageId);
        const index = placement.afterId === null ? -1 : siblings.findIndex((page) => page.id === placement.afterId);
        if (placement.afterId !== null && index < 0) return err({ code: "notFound", entity: "page" });
        const sortKey = slotKey(tx, deps, siblings, index, pageId);
        const now = deps.now();
        tx.update(pages).set({ sortKey, updatedAt: now, isDirty: true }).where(eq(pages.id, pageId)).run();
        enqueue(tx, deps, "page", pageId, "upsert");
        return ok(toPage({ ...moving, sortKey, updatedAt: now, isDirty: true }));
      });
    },

    /** Moves a page to the trash; a notebook always keeps at least one live page. */
    trash(pageId: PageId): Result<Page, RepositoryError> {
      return db.transaction((tx) => {
        const page = findLive(tx, pageId);
        if (page === undefined) return err({ code: "notFound", entity: "page" });
        if (livePages(tx, page.notebookId).length <= 1) return err({ code: "lastPage" });
        const now = deps.now();
        tx.update(pages).set({ deletedAt: now, updatedAt: now, isDirty: true }).where(eq(pages.id, pageId)).run();
        enqueue(tx, deps, "page", pageId, "upsert");
        return ok(toPage({ ...page, deletedAt: now, updatedAt: now, isDirty: true }));
      });
    },

    /** Restores a trashed page; if another page took its sort position meanwhile, it goes last. */
    restore(pageId: PageId): Result<Page, RepositoryError> {
      return db.transaction((tx) => {
        const page = tx.select().from(pages).where(eq(pages.id, pageId)).get();
        if (page === undefined || page.deletedAt === null) return err({ code: "notFound", entity: "page" });
        if (findLiveNotebook(tx, page.notebookId) === undefined) return err({ code: "notFound", entity: "notebook" });
        const collides = livePages(tx, page.notebookId).some((sibling) => sibling.sortKey === page.sortKey);
        const last = tx
          .select({ sortKey: pages.sortKey })
          .from(pages)
          .where(and(eq(pages.notebookId, page.notebookId), isNull(pages.deletedAt)))
          .orderBy(desc(pages.sortKey))
          .limit(1)
          .get();
        const sortKey = collides ? keyBetween(last?.sortKey ?? null, null) : page.sortKey;
        const now = deps.now();
        tx.update(pages)
          .set({ deletedAt: null, sortKey, updatedAt: now, isDirty: true })
          .where(eq(pages.id, pageId))
          .run();
        enqueue(tx, deps, "page", pageId, "upsert");
        return ok(toPage({ ...page, deletedAt: null, sortKey, updatedAt: now, isDirty: true }));
      });
    },

    /**
     * Records a completed save. An unchanged drawing (same hash) touches nothing, so autosaves of
     * an idle page don't churn the outbox. Writing also moves the notebook to the top of the
     * library; its metadata didn't change, so the notebook gets no outbox entry.
     */
    recordSave(pageId: PageId, sha256: string): Result<Page, RepositoryError> {
      return db.transaction((tx) => {
        const page = findLive(tx, pageId);
        if (page === undefined) return err({ code: "notFound", entity: "page" });
        if (page.drawingHash === sha256) return ok(toPage(page));
        const now = deps.now();
        const thumbnailPath = thumbnailPathFor(pageId);
        tx.update(pages)
          .set({ drawingHash: sha256, thumbnailPath, updatedAt: now, isDirty: true })
          .where(eq(pages.id, pageId))
          .run();
        enqueue(tx, deps, "page", pageId, "upsert");
        tx.update(notebooks).set({ updatedAt: now }).where(eq(notebooks.id, page.notebookId)).run();
        return ok(toPage({ ...page, drawingHash: sha256, thumbnailPath, updatedAt: now, isDirty: true }));
      });
    },
  };
}
