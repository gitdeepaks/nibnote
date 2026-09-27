import { DEFAULT_FOLDER_NAME, err, normaliseTitle, ok, type Folder, type FolderId, type Result } from "@nibnote/shared";
import { and, asc, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { folders, notebooks } from "../schema";
import { keyBetween } from "../sort-key";
import { enqueue } from "./outbox";
import { toFolder } from "./rows";
import type { Db, RepositoryDeps, RepositoryError } from "./types";

export function createFolderQueries<R>(db: Db<R>, deps: RepositoryDeps) {
  const findLive = (tx: Db<R>, id: string) =>
    tx
      .select()
      .from(folders)
      .where(and(eq(folders.id, id), isNull(folders.deletedAt)))
      .get();

  return {
    /** Live folders, parents and children together, in sort order. */
    list(): Folder[] {
      return db.select().from(folders).where(isNull(folders.deletedAt)).orderBy(asc(folders.sortKey)).all().map(toFolder);
    },

    /** Creates a folder at the top level or inside a top-level folder (one level of nesting). */
    create(input: { readonly name: string; readonly parentId: FolderId | null }): Result<Folder, RepositoryError> {
      return db.transaction((tx) => {
        if (input.parentId !== null) {
          const parent = findLive(tx, input.parentId);
          if (parent === undefined) return err({ code: "notFound", entity: "folder" });
          if (parent.parentId !== null) return err({ code: "folderTooDeep" });
        }
        const siblingsCondition = input.parentId === null ? isNull(folders.parentId) : eq(folders.parentId, input.parentId);
        const last = tx
          .select({ sortKey: folders.sortKey })
          .from(folders)
          .where(siblingsCondition)
          .orderBy(desc(folders.sortKey))
          .limit(1)
          .get();
        const now = deps.now();
        const row = {
          id: deps.newId(),
          name: normaliseTitle(input.name, DEFAULT_FOLDER_NAME),
          parentId: input.parentId,
          sortKey: keyBetween(last?.sortKey ?? null, null),
          createdAt: now,
          updatedAt: now,
        };
        tx.insert(folders).values(row).run();
        enqueue(tx, deps, "folder", row.id, "upsert");
        return ok(toFolder({ ...row, deletedAt: null, serverVersion: 0, isDirty: true }));
      });
    },

    rename(id: FolderId, name: string): Result<Folder, RepositoryError> {
      return db.transaction((tx) => {
        const folder = findLive(tx, id);
        if (folder === undefined) return err({ code: "notFound", entity: "folder" });
        const now = deps.now();
        const nextName = normaliseTitle(name, DEFAULT_FOLDER_NAME);
        tx.update(folders).set({ name: nextName, updatedAt: now, isDirty: true }).where(eq(folders.id, id)).run();
        enqueue(tx, deps, "folder", id, "upsert");
        return ok(toFolder({ ...folder, name: nextName, updatedAt: now, isDirty: true }));
      });
    },

    /**
     * Trashes a folder with its subfolders and their notebooks. Everything gets the same
     * `deletedAt`, which is how `restore` knows what was trashed together.
     */
    trash(id: FolderId): Result<Folder, RepositoryError> {
      return db.transaction((tx) => {
        const folder = findLive(tx, id);
        if (folder === undefined) return err({ code: "notFound", entity: "folder" });
        const now = deps.now();
        const folderIds = tx
          .select({ id: folders.id })
          .from(folders)
          .where(and(or(eq(folders.id, id), eq(folders.parentId, id)), isNull(folders.deletedAt)))
          .all()
          .map((row) => row.id);
        const notebookIds = tx
          .select({ id: notebooks.id })
          .from(notebooks)
          .where(and(inArray(notebooks.folderId, folderIds), isNull(notebooks.deletedAt)))
          .all()
          .map((row) => row.id);
        tx.update(folders).set({ deletedAt: now, updatedAt: now, isDirty: true }).where(inArray(folders.id, folderIds)).run();
        if (notebookIds.length > 0) {
          tx.update(notebooks)
            .set({ deletedAt: now, updatedAt: now, isDirty: true })
            .where(inArray(notebooks.id, notebookIds))
            .run();
        }
        folderIds.forEach((folderId) => {
          enqueue(tx, deps, "folder", folderId, "upsert");
        });
        notebookIds.forEach((notebookId) => {
          enqueue(tx, deps, "notebook", notebookId, "upsert");
        });
        return ok(toFolder({ ...folder, deletedAt: now, updatedAt: now, isDirty: true }));
      });
    },

    /** Restores what `trash` removed together. A subfolder whose parent is still trashed moves to the top level. */
    restore(id: FolderId): Result<Folder, RepositoryError> {
      return db.transaction((tx) => {
        const folder = tx.select().from(folders).where(eq(folders.id, id)).get();
        if (folder === undefined || folder.deletedAt === null) return err({ code: "notFound", entity: "folder" });
        const trashedAt = folder.deletedAt;
        const parentIsLive = folder.parentId === null || findLive(tx, folder.parentId) !== undefined;
        const now = deps.now();
        const folderIds = tx
          .select({ id: folders.id })
          .from(folders)
          .where(and(or(eq(folders.id, id), eq(folders.parentId, id)), eq(folders.deletedAt, trashedAt)))
          .all()
          .map((row) => row.id);
        tx.update(folders)
          .set({ deletedAt: null, updatedAt: now, isDirty: true })
          .where(inArray(folders.id, folderIds))
          .run();
        if (!parentIsLive) {
          tx.update(folders).set({ parentId: null }).where(eq(folders.id, id)).run();
        }
        const notebookIds = tx
          .select({ id: notebooks.id })
          .from(notebooks)
          .where(and(inArray(notebooks.folderId, folderIds), eq(notebooks.deletedAt, trashedAt)))
          .all()
          .map((row) => row.id);
        if (notebookIds.length > 0) {
          tx.update(notebooks)
            .set({ deletedAt: null, updatedAt: now, isDirty: true })
            .where(inArray(notebooks.id, notebookIds))
            .run();
        }
        folderIds.forEach((folderId) => {
          enqueue(tx, deps, "folder", folderId, "upsert");
        });
        notebookIds.forEach((notebookId) => {
          enqueue(tx, deps, "notebook", notebookId, "upsert");
        });
        return ok(
          toFolder({
            ...folder,
            parentId: parentIsLive ? folder.parentId : null,
            deletedAt: null,
            updatedAt: now,
            isDirty: true,
          }),
        );
      });
    },
  };
}
