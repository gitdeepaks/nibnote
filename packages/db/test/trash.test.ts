import { describe, expect, test } from "bun:test";
import { schema, TRASH_RETENTION_DAYS } from "../src";
import { DAY_MS, newNotebookInput, openTestDb, unwrap } from "./helpers";

describe("trash", () => {
  test("lists trashed notebooks and trashed pages of live notebooks", () => {
    const { repo } = openTestDb();
    const kept = unwrap(repo.notebooks.create(newNotebookInput("Kept")));
    const extra = unwrap(repo.pages.add(kept.notebook.id, null));
    const gone = unwrap(repo.notebooks.create(newNotebookInput("Gone"))).notebook;
    unwrap(repo.pages.trash(extra.id));
    unwrap(repo.notebooks.trash(gone.id));
    const contents = repo.trash.list();
    expect(contents.notebooks.map((n) => n.id)).toEqual([gone.id]);
    expect(contents.pages.map((p) => p.id)).toEqual([extra.id]);
  });

  test("delete forever removes rows, returns their files and queues deletes", () => {
    const { db, repo, outbox } = openTestDb();
    const { notebook, firstPage } = unwrap(repo.notebooks.create(newNotebookInput("DSA")));
    unwrap(repo.pages.recordSave(firstPage.id, "b".repeat(64)));
    unwrap(repo.notebooks.trash(notebook.id));
    const files = unwrap(repo.trash.deleteNotebookForever(notebook.id));
    expect(files.drawings).toEqual([firstPage.drawingPath]);
    expect(files.thumbnails).toHaveLength(1);
    expect(db.select().from(schema.notebooks).all()).toEqual([]);
    expect(db.select().from(schema.pages).all()).toEqual([]);
    expect(
      outbox()
        .filter((row) => row.op === "delete")
        .map((row) => row.entity)
        .sort(),
    ).toEqual(["notebook", "page"]);
  });

  test("only live-notebook items can't be deleted forever before they are trashed", () => {
    const { repo } = openTestDb();
    const { notebook } = unwrap(repo.notebooks.create(newNotebookInput("DSA")));
    expect(repo.trash.deleteNotebookForever(notebook.id)).toEqual({
      ok: false,
      error: { code: "notFound", entity: "notebook" },
    });
  });

  test(`purge removes items trashed over ${String(TRASH_RETENTION_DAYS)} days ago, and is idempotent`, () => {
    const { repo, advance } = openTestDb();
    const old = unwrap(repo.notebooks.create(newNotebookInput("Old"))).notebook;
    unwrap(repo.notebooks.trash(old.id));
    advance(TRASH_RETENTION_DAYS * DAY_MS - 1000);
    const recent = unwrap(repo.notebooks.create(newNotebookInput("Recent"))).notebook;
    unwrap(repo.notebooks.trash(recent.id));
    advance(2000);

    const first = repo.trash.purgeExpired();
    expect(first.drawings).toHaveLength(1);
    expect(repo.notebooks.get(old.id)).toBeNull();
    expect(repo.notebooks.get(recent.id)?.deletedAt).not.toBeNull();

    const second = repo.trash.purgeExpired();
    expect(second).toEqual({ drawings: [], thumbnails: [] });
  });
});
