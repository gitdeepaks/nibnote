import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { PageId } from "@nibnote/shared";
import { z } from "zod";
import { createRepository, schema } from "../src";
import { MIGRATIONS_FOLDER, newNotebookInput, unwrap } from "./helpers";

// Devices that ran M1–M4a have a database at migration 0000 with real notes in it. This checks
// that upgrading such a database keeps every row and only adds the new, empty columns.

const Journal = z.object({
  version: z.string(),
  dialect: z.string(),
  entries: z.array(z.object({ tag: z.string() }).loose()).min(2),
});

/** A migrations folder holding only the first migration, like the build a device already has. */
function firstMigrationOnly(): string {
  const folder = mkdtempSync(join(tmpdir(), "nibnote-migrations-"));
  mkdirSync(join(folder, "meta"));
  const journal = Journal.parse(JSON.parse(readFileSync(join(MIGRATIONS_FOLDER, "meta/_journal.json"), "utf8")));
  const [first] = journal.entries;
  if (first === undefined) throw new Error("no migrations");
  writeFileSync(join(folder, "meta/_journal.json"), JSON.stringify({ ...journal, entries: [first] }));
  copyFileSync(join(MIGRATIONS_FOLDER, `${first.tag}.sql`), join(folder, `${first.tag}.sql`));
  return folder;
}

describe("migration 0001 on an existing database", () => {
  test("keeps every notebook, page and folder, and leaves the new columns empty", () => {
    const sqlite = new Database(":memory:");
    sqlite.run("PRAGMA foreign_keys = ON");
    const db = drizzle(sqlite);
    const oldFolder = firstMigrationOnly();
    try {
      migrate(db, { migrationsFolder: oldFolder });
      // Write with raw SQL: the current schema's columns don't exist yet at 0000.
      const now = 1_790_000_000_000;
      const notebookId = crypto.randomUUID();
      const pageId = PageId.parse(crypto.randomUUID());
      const folderId = crypto.randomUUID();
      sqlite.run(
        "INSERT INTO folders (id, name, parent_id, sort_key, created_at, updated_at) VALUES (?, 'Work', NULL, 'a0', ?, ?)",
        [folderId, now, now],
      );
      sqlite.run(
        `INSERT INTO notebooks (id, folder_id, title, cover_color, page_size, default_template, created_at, updated_at)
         VALUES (?, ?, 'DSA', '#0A60FF', '{"widthPt":595,"heightPt":842}', '{"kind":"lined","spacingPt":24}', ?, ?)`,
        [notebookId, folderId, now, now],
      );
      sqlite.run(
        `INSERT INTO pages (id, notebook_id, sort_key, template, width_pt, height_pt, drawing_path, created_at, updated_at)
         VALUES (?, ?, 'a0', '{"kind":"lined","spacingPt":24}', 595, 842, ?, ?, ?)`,
        [pageId, notebookId, `notebooks/${notebookId}/${pageId}.drawing`, now, now],
      );

      migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

      const repo = createRepository(db, { now: () => now, newId: () => crypto.randomUUID() });
      const [notebook] = repo.notebooks.list({ kind: "all" });
      expect(notebook?.title).toBe("DSA");
      expect(notebook?.role).toBeNull();
      expect(repo.folders.list().map((folder) => [folder.name, folder.role])).toEqual([["Work", null]]);
      const [page] = notebook === undefined ? [] : repo.pages.list(notebook.id);
      expect(page?.id).toBe(pageId);
      expect(page?.dailyDate).toBeNull();
      // The upgraded database works like a fresh one.
      unwrap(repo.notebooks.create(newNotebookInput("After upgrade")));
      expect(db.select().from(schema.notebooks).all()).toHaveLength(2);
    } finally {
      rmSync(oldFolder, { recursive: true, force: true });
    }
  });
});
