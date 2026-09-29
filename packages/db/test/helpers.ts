import { Database } from "bun:sqlite";
import { HexColor, PAGE_SIZES, type PageTemplate } from "@nibnote/shared";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { createRepository, schema } from "../src";

export const MIGRATIONS_FOLDER = new URL("../drizzle", import.meta.url).pathname;
export const DAY_MS = 24 * 60 * 60 * 1000;
export const START = 1_790_000_000_000;

export const LINED: PageTemplate = { kind: "lined", spacingPt: 24 };
export const BLUE = HexColor.parse("#0A60FF");

/** A fresh in-memory database with the real migrations applied and foreign keys on, like the app. */
export function openTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.run("PRAGMA foreign_keys = ON");
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  let clock = START;
  const ids: string[] = [];
  const deps = {
    now: () => clock,
    newId: () => {
      const id = crypto.randomUUID();
      ids.push(id);
      return id;
    },
  };
  return {
    db,
    sqlite,
    deps,
    repo: createRepository(db, deps),
    advance: (ms: number) => {
      clock += ms;
    },
    outbox: () => db.select().from(schema.syncOutbox).all(),
  };
}

export function newNotebookInput(title: string) {
  return { title, coverColor: BLUE, pageSize: PAGE_SIZES.a4Portrait, defaultTemplate: LINED, folderId: null };
}

/** Unwraps a Result in tests; a failure fails the test with the error. */
export function unwrap<T>(
  result: { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: object },
): T {
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result.error)}`);
  return result.value;
}
