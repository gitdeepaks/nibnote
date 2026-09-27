import {
  assertNever,
  DEFAULT_NOTEBOOK_TITLE,
  err,
  normaliseTitle,
  NotebookId,
  ok,
  PageId,
  type FolderId,
  type HexColor,
  type Notebook,
  type Page,
  type PageSize,
  type PageTemplate,
  type Result,
} from "@nibnote/shared";
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { folders, notebooks } from "../schema";
import { keyBetween } from "../sort-key";
import { enqueue } from "./outbox";
import { defaultShape, insertPage } from "./pages";
import { toNotebook } from "./rows";
import type { Db, RepositoryDeps, RepositoryError } from "./types";

export type NotebookFilter =
  | { readonly kind: "all" }
  | { readonly kind: "favourites" }
  | { readonly kind: "recents"; readonly limit: number }
  | { readonly kind: "folder"; readonly folderId: FolderId };

export type NewNotebook = {
  readonly title: string;
  readonly coverColor: HexColor;
  readonly pageSize: PageSize;
  readonly defaultTemplate: PageTemplate;
  readonly folderId: FolderId | null;
};

export type NotebookPatch = {
  readonly title?: string;
  readonly coverColor?: HexColor;
  readonly isFavourite?: boolean;
  readonly folderId?: FolderId | null;
};

export function createNotebookQueries<R>(db: Db<R>, deps: RepositoryDeps) {
  const findLive = (tx: Db<R>, id: string) =>
    tx
      .select()
      .from(notebooks)
      .where(and(eq(notebooks.id, id), isNull(notebooks.deletedAt)))
      .get();

  const folderIsLive = (tx: Db<R>, folderId: FolderId) =>
    tx
      .select({ id: folders.id })
      .from(folders)
      .where(and(eq(folders.id, folderId), isNull(folders.deletedAt)))
      .get() !== undefined;

  return {
    list(filter: NotebookFilter): Notebook[] {
      const live = isNull(notebooks.deletedAt);
      const query = db.select().from(notebooks);
      switch (filter.kind) {
        case "all":
          return query.where(live).orderBy(desc(notebooks.updatedAt)).all().map(toNotebook);
        case "favourites":
          return query
            .where(and(live, eq(notebooks.isFavourite, true)))
            .orderBy(desc(notebooks.updatedAt))
            .all()
            .map(toNotebook);
        case "recents":
          return query
            .where(and(live, isNotNull(notebooks.lastOpenedAt)))
            .orderBy(desc(notebooks.lastOpenedAt))
            .limit(filter.limit)
            .all()
            .map(toNotebook);
        case "folder":
          return query
            .where(and(live, eq(notebooks.folderId, filter.folderId)))
            .orderBy(desc(notebooks.updatedAt))
            .all()
            .map(toNotebook);
        default:
          return assertNever(filter);
      }
    },

    get(id: NotebookId): Notebook | undefined {
      const row = db.select().from(notebooks).where(eq(notebooks.id, id)).get();
      return row === undefined ? undefined : toNotebook(row);
    },

    /** A notebook that isn't in the trash; the editor and deep links open only these. */
    getLive(id: NotebookId): Notebook | undefined {
      const row = findLive(db, id);
      return row === undefined ? undefined : toNotebook(row);
    },

    /** Creates a notebook with its first blank page, in one transaction. */
    create(input: NewNotebook): Result<{ readonly notebook: Notebook; readonly firstPage: Page }, RepositoryError> {
      return db.transaction((tx) => {
        if (input.folderId !== null && !folderIsLive(tx, input.folderId)) {
          return err({ code: "notFound", entity: "folder" });
        }
        const now = deps.now();
        const row = {
          id: NotebookId.parse(deps.newId()),
          folderId: input.folderId,
          title: normaliseTitle(input.title, DEFAULT_NOTEBOOK_TITLE),
          coverColor: input.coverColor,
          pageSize: JSON.stringify(input.pageSize),
          defaultTemplate: JSON.stringify(input.defaultTemplate),
          createdAt: now,
          updatedAt: now,
        };
        tx.insert(notebooks).values(row).run();
        enqueue(tx, deps, "notebook", row.id, "upsert");
        const inserted = findLive(tx, row.id);
        if (inserted === undefined) return err({ code: "notFound", entity: "notebook" });
        const firstPage = insertPage(
          tx,
          deps,
          row.id,
          PageId.parse(deps.newId()),
          keyBetween(null, null),
          defaultShape(inserted),
        );
        return ok({ notebook: toNotebook(inserted), firstPage });
      });
    },

    update(id: NotebookId, patch: NotebookPatch): Result<Notebook, RepositoryError> {
      return db.transaction((tx) => {
        const notebook = findLive(tx, id);
        if (notebook === undefined) return err({ code: "notFound", entity: "notebook" });
        if (patch.folderId != null && !folderIsLive(tx, patch.folderId)) {
          return err({ code: "notFound", entity: "folder" });
        }
        // Favouriting is a label, not an edit: it syncs but keeps the notebook's place in the library.
        const edited = patch.title !== undefined || patch.coverColor !== undefined || patch.folderId !== undefined;
        const changes = {
          ...(patch.title === undefined ? {} : { title: normaliseTitle(patch.title, DEFAULT_NOTEBOOK_TITLE) }),
          ...(patch.coverColor === undefined ? {} : { coverColor: patch.coverColor }),
          ...(patch.isFavourite === undefined ? {} : { isFavourite: patch.isFavourite }),
          ...(patch.folderId === undefined ? {} : { folderId: patch.folderId }),
          ...(edited ? { updatedAt: deps.now() } : {}),
          isDirty: true,
        };
        tx.update(notebooks).set(changes).where(eq(notebooks.id, id)).run();
        enqueue(tx, deps, "notebook", id, "upsert");
        return ok(toNotebook({ ...notebook, ...changes }));
      });
    },

    /** Device-local "recently opened" marker: not a content change, so no outbox entry. */
    markOpened(id: NotebookId): void {
      db.update(notebooks).set({ lastOpenedAt: deps.now() }).where(eq(notebooks.id, id)).run();
    },

    trash(id: NotebookId): Result<Notebook, RepositoryError> {
      return db.transaction((tx) => {
        const notebook = findLive(tx, id);
        if (notebook === undefined) return err({ code: "notFound", entity: "notebook" });
        const now = deps.now();
        tx.update(notebooks).set({ deletedAt: now, updatedAt: now, isDirty: true }).where(eq(notebooks.id, id)).run();
        enqueue(tx, deps, "notebook", id, "upsert");
        return ok(toNotebook({ ...notebook, deletedAt: now, updatedAt: now, isDirty: true }));
      });
    },

    /** Restores a trashed notebook; if its folder is still in the trash, it moves to the top level. */
    restore(id: NotebookId): Result<Notebook, RepositoryError> {
      return db.transaction((tx) => {
        const notebook = tx.select().from(notebooks).where(eq(notebooks.id, id)).get();
        if (notebook === undefined || notebook.deletedAt === null) return err({ code: "notFound", entity: "notebook" });
        const folderId =
          notebook.folderId !== null &&
          tx
            .select({ id: folders.id })
            .from(folders)
            .where(and(eq(folders.id, notebook.folderId), isNull(folders.deletedAt)))
            .get() !== undefined
            ? notebook.folderId
            : null;
        const now = deps.now();
        tx.update(notebooks)
          .set({ deletedAt: null, folderId, updatedAt: now, isDirty: true })
          .where(eq(notebooks.id, id))
          .run();
        enqueue(tx, deps, "notebook", id, "upsert");
        return ok(toNotebook({ ...notebook, deletedAt: null, folderId, updatedAt: now, isDirty: true }));
      });
    },
  };
}
