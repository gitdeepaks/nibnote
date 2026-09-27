import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";

/**
 * Any synchronous SQLite database: expo-sqlite in the app, bun:sqlite in tests. `RunResult` is the
 * driver's result type for `run()`; queries never depend on it, so it stays a type parameter.
 * Transactions are databases too, so every helper accepts either.
 */
export type Db<RunResult> = BaseSQLiteDatabase<"sync", RunResult>;

/** Injected so tests control time and IDs. */
export type RepositoryDeps = {
  readonly now: () => number;
  readonly newId: () => string;
};

export type RepositoryError =
  | { readonly code: "notFound"; readonly entity: "folder" | "notebook" | "page" }
  | { readonly code: "folderTooDeep" }
  | { readonly code: "lastPage" };
