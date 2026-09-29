import {
  err,
  ok,
  type Folder,
  type FolderId,
  type Notebook,
  type NotebookId,
  type Page,
  type PageId,
  type RelativePath,
  type Result,
} from "@nibnote/shared";
import { and, desc, eq, inArray, isNotNull, isNull, lte } from "drizzle-orm";
import { folders, notebooks, pages } from "../schema";
import { enqueue } from "./outbox";
import { toFolder, toNotebook, toPage } from "./rows";
import type { Db, RepositoryDeps, RepositoryError } from "./types";

export const TRASH_RETENTION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Files the caller must delete after rows are purged (file I/O lives in the app). */
export type PurgedFiles = { readonly drawings: RelativePath[]; readonly thumbnails: RelativePath[] };

export type TrashContents = {
  readonly folders: Folder[];
  readonly notebooks: Notebook[];
  /** Trashed pages whose notebook is still live (pages of a trashed notebook go with it). */
  readonly pages: Page[];
};

export function createTrashQueries<R>(db: Db<R>, deps: RepositoryDeps) {
  /** Hard-deletes pages and returns their files. Call inside a transaction. */
  const purgePages = (tx: Db<R>, ids: readonly string[], files: PurgedFiles) => {
    if (ids.length === 0) return;
    const rows = tx
      .select()
      .from(pages)
      .where(inArray(pages.id, [...ids]))
      .all();
    for (const row of rows) {
      const page = toPage(row);
      files.drawings.push(page.drawingPath);
      if (page.thumbnailPath !== null) files.thumbnails.push(page.thumbnailPath);
      enqueue(tx, deps, "page", page.id, "delete");
    }
    tx.delete(pages)
      .where(inArray(pages.id, [...ids]))
      .run();
  };

  const purgeNotebooks = (tx: Db<R>, ids: readonly string[], files: PurgedFiles) => {
    if (ids.length === 0) return;
    const pageIds = tx
      .select({ id: pages.id })
      .from(pages)
      .where(inArray(pages.notebookId, [...ids]))
      .all();
    purgePages(
      tx,
      pageIds.map((row) => row.id),
      files,
    );
    ids.forEach((id) => {
      enqueue(tx, deps, "notebook", id, "delete");
    });
    tx.delete(notebooks)
      .where(inArray(notebooks.id, [...ids]))
      .run();
  };

  const purgeFolders = (tx: Db<R>, ids: readonly string[], files: PurgedFiles) => {
    if (ids.length === 0) return;
    const notebookIds = tx
      .select({ id: notebooks.id })
      .from(notebooks)
      .where(and(inArray(notebooks.folderId, [...ids]), isNotNull(notebooks.deletedAt)))
      .all()
      .map((row) => row.id);
    purgeNotebooks(tx, notebookIds, files);
    ids.forEach((id) => {
      enqueue(tx, deps, "folder", id, "delete");
    });
    tx.delete(folders)
      .where(inArray(folders.id, [...ids]))
      .run();
  };

  const emptyFiles = (): PurgedFiles => ({ drawings: [], thumbnails: [] });

  return {
    list(): TrashContents {
      const trashedFolders = db
        .select()
        .from(folders)
        .where(isNotNull(folders.deletedAt))
        .orderBy(desc(folders.deletedAt))
        .all();
      const trashedNotebooks = db
        .select()
        .from(notebooks)
        .where(isNotNull(notebooks.deletedAt))
        .orderBy(desc(notebooks.deletedAt))
        .all();
      const trashedPages = db
        .select({ page: pages })
        .from(pages)
        .innerJoin(notebooks, eq(pages.notebookId, notebooks.id))
        .where(and(isNotNull(pages.deletedAt), isNull(notebooks.deletedAt)))
        .orderBy(desc(pages.deletedAt))
        .all();
      return {
        folders: trashedFolders.map(toFolder),
        notebooks: trashedNotebooks.map(toNotebook),
        pages: trashedPages.map((row) => toPage(row.page)),
      };
    },

    deleteFolderForever(id: FolderId): Result<PurgedFiles, RepositoryError> {
      return db.transaction((tx) => {
        const folder = tx.select().from(folders).where(eq(folders.id, id)).get();
        if (folder === undefined || folder.deletedAt === null) return err({ code: "notFound", entity: "folder" });
        const subfolders = tx.select({ id: folders.id }).from(folders).where(eq(folders.parentId, id)).all();
        const files = emptyFiles();
        purgeFolders(tx, [id, ...subfolders.map((row) => row.id)], files);
        return ok(files);
      });
    },

    deleteNotebookForever(id: NotebookId): Result<PurgedFiles, RepositoryError> {
      return db.transaction((tx) => {
        const notebook = tx.select().from(notebooks).where(eq(notebooks.id, id)).get();
        if (notebook === undefined || notebook.deletedAt === null) {
          return err({ code: "notFound", entity: "notebook" });
        }
        const files = emptyFiles();
        purgeNotebooks(tx, [id], files);
        return ok(files);
      });
    },

    deletePageForever(id: PageId): Result<PurgedFiles, RepositoryError> {
      return db.transaction((tx) => {
        const page = tx.select().from(pages).where(eq(pages.id, id)).get();
        if (page === undefined || page.deletedAt === null) return err({ code: "notFound", entity: "page" });
        const files = emptyFiles();
        purgePages(tx, [id], files);
        return ok(files);
      });
    },

    /**
     * Hard-deletes everything trashed more than 30 days ago. Idempotent: running it twice
     * deletes nothing the second time. Returns the files to delete.
     */
    purgeExpired(): PurgedFiles {
      const cutoff = deps.now() - TRASH_RETENTION_DAYS * DAY_MS;
      return db.transaction((tx) => {
        const files = emptyFiles();
        const expiredFolders = tx.select({ id: folders.id }).from(folders).where(lte(folders.deletedAt, cutoff)).all();
        purgeFolders(
          tx,
          expiredFolders.map((row) => row.id),
          files,
        );
        const expiredNotebooks = tx
          .select({ id: notebooks.id })
          .from(notebooks)
          .where(lte(notebooks.deletedAt, cutoff))
          .all();
        purgeNotebooks(
          tx,
          expiredNotebooks.map((row) => row.id),
          files,
        );
        const expiredPages = tx.select({ id: pages.id }).from(pages).where(lte(pages.deletedAt, cutoff)).all();
        purgePages(
          tx,
          expiredPages.map((row) => row.id),
          files,
        );
        return files;
      });
    },
  };
}
