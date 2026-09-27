import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { migrationBundle, pendingMigrationCount } from "../src";
import { MigrationJournal, migrationKey } from "../src/migration-bundle";
import { MIGRATIONS_FOLDER } from "./helpers";

describe("migrations", () => {
  test("the bundled module matches drizzle/ exactly (run `bun run db:generate` after schema changes)", async () => {
    const journal = MigrationJournal.parse(await Bun.file(`${MIGRATIONS_FOLDER}/meta/_journal.json`).json());
    expect(migrationBundle.journal).toEqual(journal);
    for (const entry of journal.entries) {
      const sql = await Bun.file(`${MIGRATIONS_FOLDER}/${entry.tag}.sql`).text();
      expect(migrationBundle.migrations[migrationKey(entry.idx)]).toBe(sql);
    }
  });

  test("pending count: everything before the first migration, nothing after", () => {
    const db = drizzle(new Database(":memory:"));
    expect(pendingMigrationCount(db, migrationBundle)).toBe(migrationBundle.journal.entries.length);
    migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    expect(pendingMigrationCount(db, migrationBundle)).toBe(0);
  });
});
