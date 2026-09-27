import { and, count, eq } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { MigrationBundle } from "./migration-bundle";
import type { Db } from "./repository/types";

// SQLite's catalog and Drizzle's bookkeeping table, declared so they can be queried with the typed
// builder: raw `db.get(sql…)` returns different row shapes on different drivers.
const sqliteMaster = sqliteTable("sqlite_master", { type: text("type"), name: text("name") });
const drizzleMigrations = sqliteTable("__drizzle_migrations", { id: integer("id") });

/**
 * How many bundled migrations the database hasn't applied yet. The app backs the database up
 * only when this is above zero, so an ordinary launch never copies the file.
 */
export function pendingMigrationCount<R>(db: Db<R>, bundle: MigrationBundle): number {
  const total = bundle.journal.entries.length;
  const table = db
    .select({ value: count() })
    .from(sqliteMaster)
    .where(and(eq(sqliteMaster.type, "table"), eq(sqliteMaster.name, "__drizzle_migrations")))
    .get();
  if ((table?.value ?? 0) === 0) return total;
  const applied = db.select({ value: count() }).from(drizzleMigrations).get();
  return Math.max(0, total - (applied?.value ?? 0));
}
