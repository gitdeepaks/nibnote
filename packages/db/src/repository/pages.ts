import { err, NotebookId, ok, PageId, PageSize, type Page, type RelativePath, type Result } from "@nibnote/shared";
import { and, asc, count, desc, eq, isNull } from "drizzle-orm";
import { drawingPathFor, thumbnailPathFor } from "../paths";
import { notebooks, pages } from "../schema";
import { evenlySpacedKeys, keyBetween, needsRebalance } from "../sort-key";
import { enqueue } from "./outbox";
import { toPage } from "./rows";
import type { Db, RepositoryDeps, RepositoryError } from "./types";

type NotebookRow = typeof notebooks.$inferSelect;
type PageRow = typeof pages.$inferSelect;

/** Where a moved page goes: directly after `afterId`, or first when `afterId` is null. */
export type PagePlacement = { readonly afterId: PageId | null };

/** A duplicated page's drawing must be copied by the caller (file I/O lives in the app). */
export type DuplicatedPage = { readonly page: Page; readonly copyFrom: RelativePath; readonly copyTo: RelativePath };

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

export function createPageQueries<R>(db: Db<R>, deps: RepositoryDeps) {
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

  return {
    list(notebookId: NotebookId): Page[] {
      return livePages(db, notebookId).map(toPage);
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

    /** Adds a blank page after `afterId`, or at the end when omitted. */
    add(notebookId: NotebookId, afterId?: PageId): Result<Page, RepositoryError> {
      return db.transaction((tx) => {
        const notebook = findLiveNotebook(tx, notebookId);
        if (notebook === undefined) return err({ code: "notFound", entity: "notebook" });
        const siblings = livePages(tx, notebookId);
        const index = afterId === undefined ? siblings.length - 1 : siblings.findIndex((page) => page.id === afterId);
        if (afterId !== undefined && index < 0) return err({ code: "notFound", entity: "page" });
        const pageId = PageId.parse(deps.newId());
        const sortKey = slotKey(tx, deps, siblings, index, pageId);
        return ok(insertPage(tx, deps, notebookId, pageId, sortKey, defaultShape(notebook)));
      });
    },

    /** Copies a page's template and size right after it; the caller copies the drawing file. */
    duplicate(pageId: PageId): Result<DuplicatedPage, RepositoryError> {
      return db.transaction((tx) => {
        const source = findLive(tx, pageId);
        if (source === undefined) return err({ code: "notFound", entity: "page" });
        const siblings = livePages(tx, source.notebookId);
        const index = siblings.findIndex((page) => page.id === pageId);
        const copyId = PageId.parse(deps.newId());
        const sortKey = slotKey(tx, deps, siblings, index, copyId);
        const notebookId = NotebookId.parse(source.notebookId);
        const page = insertPage(tx, deps, notebookId, copyId, sortKey, source);
        return ok({ page, copyFrom: toPage(source).drawingPath, copyTo: page.drawingPath });
      });
    },

    move(pageId: PageId, placement: PagePlacement): Result<Page, RepositoryError> {
      return db.transaction((tx) => {
        const moving = findLive(tx, pageId);
        if (moving === undefined) return err({ code: "notFound", entity: "page" });
        const siblings = livePages(tx, moving.notebookId).filter((page) => page.id !== pageId);
        const index =
          placement.afterId === null ? -1 : siblings.findIndex((page) => page.id === placement.afterId);
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
     * an idle page don't churn the outbox.
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
        return ok(toPage({ ...page, drawingHash: sha256, thumbnailPath, updatedAt: now, isDirty: true }));
      });
    },
  };
}
