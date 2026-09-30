import { createCaptureQueries } from "./repository/capture";
import { createFolderQueries } from "./repository/folders";
import { createNotebookQueries } from "./repository/notebooks";
import { createPageQueries } from "./repository/pages";
import { createSettingsQueries } from "./repository/settings";
import { createTabQueries } from "./repository/tabs";
import { createTrashQueries } from "./repository/trash";
import type { Db, RepositoryDeps } from "./repository/types";

// The only way the app touches the local database: screens call these, never Drizzle directly.
export function createRepository<R>(db: Db<R>, deps: RepositoryDeps) {
  return {
    folders: createFolderQueries(db, deps),
    notebooks: createNotebookQueries(db, deps),
    pages: createPageQueries(db, deps),
    trash: createTrashQueries(db, deps),
    settings: createSettingsQueries(db),
    capture: createCaptureQueries(db, deps),
    tabs: createTabQueries(db),
  };
}

export type Repository = ReturnType<typeof createRepository>;

export type { MigrationBundle } from "./migration-bundle";
export { pendingMigrationCount } from "./migration-status";
export { migrationBundle } from "./migrations.generated";
export { nearestRemaining, neighbourAfterRemoval, placementFor, placementForIndex, type PageMove } from "./page-moves";
export { drawingPathFor, resolvePath, thumbnailPathFor } from "./paths";
export type { NewNotebook, NotebookFilter, NotebookPatch } from "./repository/notebooks";
export type { OpenedPage } from "./repository/capture";
export type { DuplicatedPage, PagePlacement } from "./repository/pages";
export { MAX_TABS } from "./repository/tabs";
export { TRASH_RETENTION_DAYS, type PurgedFiles, type TrashContents } from "./repository/trash";
export type { Db, RepositoryDeps, RepositoryError } from "./repository/types";
export * as schema from "./schema";
export { SORT_KEY_MAX_LENGTH } from "./sort-key";
