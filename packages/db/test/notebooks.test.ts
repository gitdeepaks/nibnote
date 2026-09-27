import { describe, expect, test } from "bun:test";
import { DEFAULT_NOTEBOOK_TITLE, FolderId, PAGE_SIZES, RelativePath } from "@nibnote/shared";
import { createRepository, schema } from "../src";
import { LINED, newNotebookInput, openTestDb, unwrap } from "./helpers";

describe("notebooks", () => {
  test("creating a notebook also creates its first page with the notebook's size and template", () => {
    const { repo } = openTestDb();
    const { notebook, firstPage } = unwrap(repo.notebooks.create({ ...newNotebookInput(), pageSize: PAGE_SIZES.letter }));
    expect(notebook.title).toBe("DSA");
    expect(firstPage.notebookId).toBe(notebook.id);
    expect(firstPage.widthPt).toBe(PAGE_SIZES.letter.widthPt);
    expect(firstPage.heightPt).toBe(PAGE_SIZES.letter.heightPt);
    expect(firstPage.template).toEqual(LINED);
    expect(firstPage.drawingPath).toBe(RelativePath.parse(`notebooks/${notebook.id}/${firstPage.id}.drawing`));
    expect(repo.pages.list(notebook.id).map((page) => page.id)).toEqual([firstPage.id]);
  });

  test("the notebook and its first page are queued for sync in the same transaction", () => {
    const { repo, outbox } = openTestDb();
    const { notebook, firstPage } = unwrap(repo.notebooks.create(newNotebookInput()));
    expect(outbox().map((row) => [row.entity, row.entityId, row.op])).toEqual([
      ["notebook", notebook.id, "upsert"],
      ["page", firstPage.id, "upsert"],
    ]);
  });

  test("a failure mid-create rolls back every row, including the outbox", () => {
    const { db, deps, repo, outbox } = openTestDb();
    let calls = 0;
    const failing = { ...deps, newId: () => (++calls === 2 ? "not-a-uuid" : crypto.randomUUID()) };
    expect(() => createRepository(db, failing).notebooks.create(newNotebookInput())).toThrow();
    expect(repo.notebooks.list({ kind: "all" })).toEqual([]);
    expect(db.select().from(schema.pages).all()).toEqual([]);
    expect(outbox()).toEqual([]);
  });

  test("blank titles get the default name; emoji titles survive", () => {
    const { repo } = openTestDb();
    expect(unwrap(repo.notebooks.create(newNotebookInput("   "))).notebook.title).toBe(DEFAULT_NOTEBOOK_TITLE);
    expect(unwrap(repo.notebooks.create(newNotebookInput("📐 System design"))).notebook.title).toBe("📐 System design");
  });

  test("creating inside a missing folder fails without writing anything", () => {
    const { repo, outbox } = openTestDb();
    const result = repo.notebooks.create({ ...newNotebookInput(), folderId: FolderId.parse(crypto.randomUUID()) });
    expect(result).toEqual({ ok: false, error: { code: "notFound", entity: "folder" } });
    expect(outbox()).toEqual([]);
  });

  test("filters: favourites, recents (most recent first, limited) and folder", () => {
    const { repo, advance } = openTestDb();
    const folder = unwrap(repo.folders.create({ name: "Work", parentId: null }));
    const a = unwrap(repo.notebooks.create(newNotebookInput("A"))).notebook;
    const b = unwrap(repo.notebooks.create({ ...newNotebookInput("B"), folderId: folder.id })).notebook;
    const c = unwrap(repo.notebooks.create(newNotebookInput("C"))).notebook;
    unwrap(repo.notebooks.update(b.id, { isFavourite: true }));
    repo.notebooks.markOpened(a.id);
    advance(1000);
    repo.notebooks.markOpened(c.id);

    expect(repo.notebooks.list({ kind: "favourites" }).map((n) => n.id)).toEqual([b.id]);
    expect(repo.notebooks.list({ kind: "recents", limit: 10 }).map((n) => n.id)).toEqual([c.id, a.id]);
    expect(repo.notebooks.list({ kind: "recents", limit: 1 }).map((n) => n.id)).toEqual([c.id]);
    expect(repo.notebooks.list({ kind: "folder", folderId: folder.id }).map((n) => n.id)).toEqual([b.id]);
  });

  test("favouriting syncs but keeps the library order; renaming moves the notebook to the top", () => {
    const { repo, outbox, advance } = openTestDb();
    const a = unwrap(repo.notebooks.create(newNotebookInput("A"))).notebook;
    advance(1000);
    const b = unwrap(repo.notebooks.create(newNotebookInput("B"))).notebook;
    advance(1000);
    const before = outbox().length;
    const favourite = unwrap(repo.notebooks.update(a.id, { isFavourite: true }));
    expect(favourite.updatedAt).toBe(a.updatedAt);
    expect(outbox()).toHaveLength(before + 1);
    expect(repo.notebooks.list({ kind: "all" }).map((n) => n.id)).toEqual([b.id, a.id]);

    unwrap(repo.notebooks.update(a.id, { title: "A2" }));
    expect(repo.notebooks.list({ kind: "all" }).map((n) => n.id)).toEqual([a.id, b.id]);
  });

  test("opening a notebook is device-local and doesn't queue a sync change", () => {
    const { repo, outbox } = openTestDb();
    const { notebook } = unwrap(repo.notebooks.create(newNotebookInput()));
    const before = outbox().length;
    repo.notebooks.markOpened(notebook.id);
    expect(outbox()).toHaveLength(before);
  });

  test("trash hides a notebook; restore brings it back", () => {
    const { repo } = openTestDb();
    const { notebook } = unwrap(repo.notebooks.create(newNotebookInput()));
    unwrap(repo.notebooks.trash(notebook.id));
    expect(repo.notebooks.list({ kind: "all" })).toEqual([]);
    unwrap(repo.notebooks.restore(notebook.id));
    expect(repo.notebooks.list({ kind: "all" }).map((n) => n.id)).toEqual([notebook.id]);
  });

  test("restoring a notebook whose folder is still trashed moves it to the top level", () => {
    const { repo } = openTestDb();
    const folder = unwrap(repo.folders.create({ name: "Old", parentId: null }));
    const { notebook } = unwrap(repo.notebooks.create({ ...newNotebookInput(), folderId: folder.id }));
    unwrap(repo.folders.trash(folder.id));
    expect(unwrap(repo.notebooks.restore(notebook.id)).folderId).toBeNull();
  });
});
