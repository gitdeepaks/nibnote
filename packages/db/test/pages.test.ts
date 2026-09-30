import { describe, expect, test } from "bun:test";
import { PAGE_SIZES, RelativePath, type NotebookId, type PageId } from "@nibnote/shared";
import { SORT_KEY_MAX_LENGTH } from "../src";
import { newNotebookInput, openTestDb, unwrap } from "./helpers";

function setup(pageCount: number) {
  const env = openTestDb();
  const { notebook, firstPage } = unwrap(env.repo.notebooks.create(newNotebookInput("DSA")));
  const ids: PageId[] = [firstPage.id];
  for (let i = 1; i < pageCount; i++) ids.push(unwrap(env.repo.pages.add(notebook.id, null)).id);
  const orderOf = (id: NotebookId) => env.repo.pages.list(id).map((page) => page.id);
  const order = () => orderOf(notebook.id);
  return { ...env, notebook, ids, order, orderOf };
}

describe("pages", () => {
  test("add appends by default, or inserts right after a given page", () => {
    const { repo, notebook, ids, order } = setup(3);
    const [first, second, third] = ids;
    if (first === undefined || second === undefined || third === undefined) throw new Error("setup");
    const inserted = unwrap(repo.pages.add(notebook.id, first));
    expect(order()).toEqual([first, inserted.id, second, third]);
  });

  test("new pages use the notebook's size and template", () => {
    const { repo, notebook } = setup(1);
    const page = unwrap(repo.pages.add(notebook.id, null));
    expect([page.widthPt, page.heightPt]).toEqual([PAGE_SIZES.a4Portrait.widthPt, PAGE_SIZES.a4Portrait.heightPt]);
    expect(page.template).toEqual(notebook.defaultTemplate);
  });

  test("duplicate goes right after the source and returns the drawing files to copy", () => {
    const { repo, ids, order } = setup(2);
    const [first, second] = ids;
    if (first === undefined || second === undefined) throw new Error("setup");
    const { page, copyFrom, copyTo } = unwrap(repo.pages.duplicate(first));
    expect(order()).toEqual([first, page.id, second]);
    expect(copyFrom).toBe(RelativePath.parse(`notebooks/${page.notebookId}/${first}.drawing`));
    expect(copyTo).toBe(page.drawingPath);
    expect(copyTo).not.toBe(copyFrom);
  });

  test("move to the front, to the end, and between pages", () => {
    const { repo, ids, order } = setup(4);
    const [a, b, c, d] = ids;
    if (a === undefined || b === undefined || c === undefined || d === undefined) throw new Error("setup");
    unwrap(repo.pages.move(d, { afterId: null }));
    expect(order()).toEqual([d, a, b, c]);
    unwrap(repo.pages.move(d, { afterId: c }));
    expect(order()).toEqual([a, b, c, d]);
    unwrap(repo.pages.move(a, { afterId: b }));
    expect(order()).toEqual([b, a, c, d]);
  });

  test("200 reorders into the same gap keep sort keys bounded and the order correct", () => {
    const { repo, notebook, ids, order } = setup(3);
    const [a, b, c] = ids;
    if (a === undefined || b === undefined || c === undefined) throw new Error("setup");
    // Repeatedly move c between a and b, then b between a and c: keys would grow without rebalancing.
    for (let i = 0; i < 100; i++) {
      unwrap(repo.pages.move(c, { afterId: a }));
      unwrap(repo.pages.move(b, { afterId: a }));
    }
    expect(order()).toEqual([a, b, c]);
    for (const page of repo.pages.list(notebook.id)) {
      expect(page.sortKey.length).toBeLessThanOrEqual(SORT_KEY_MAX_LENGTH);
    }
  });

  test("the last live page can't be trashed", () => {
    const { repo, ids } = setup(1);
    const [only] = ids;
    if (only === undefined) throw new Error("setup");
    expect(repo.pages.trash(only)).toEqual({ ok: false, error: { code: "lastPage" } });
  });

  test("restore puts a page back in place, or last if its slot was taken", () => {
    const { repo, notebook, ids, order } = setup(3);
    const [a, b, c] = ids;
    if (a === undefined || b === undefined || c === undefined) throw new Error("setup");
    unwrap(repo.pages.trash(b));
    unwrap(repo.pages.restore(b));
    expect(order()).toEqual([a, b, c]);

    unwrap(repo.pages.trash(b));
    const intruder = unwrap(repo.pages.add(notebook.id, a)).id; // takes b's old slot between a and c
    unwrap(repo.pages.restore(b));
    const restoredOrder = order();
    expect(new Set(restoredOrder).size).toBe(4);
    expect(restoredOrder.slice(0, 3)).toEqual([a, intruder, c]);
    expect(restoredOrder.at(-1)).toBe(b);
  });

  test("recordSave stores the hash and thumbnail path once; an unchanged hash is a no-op", () => {
    const { repo, ids, outbox } = setup(1);
    const [page] = ids;
    if (page === undefined) throw new Error("setup");
    const hash = "a".repeat(64);
    const saved = unwrap(repo.pages.recordSave(page, hash));
    expect(saved.drawingHash).toBe(hash);
    expect(saved.thumbnailPath).toBe(RelativePath.parse(`thumbs/${page}.png`));
    const before = outbox().length;
    unwrap(repo.pages.recordSave(page, hash));
    expect(outbox()).toHaveLength(before);
  });

  test("writing on a page moves its notebook to the top without queueing the notebook", () => {
    const { repo, notebook, ids, outbox, advance } = setup(1);
    advance(1000);
    const other = unwrap(repo.notebooks.create(newNotebookInput("Other"))).notebook;
    const [page] = ids;
    if (page === undefined) throw new Error("setup");
    expect(repo.notebooks.list({ kind: "all" }).map((n) => n.id)).toEqual([other.id, notebook.id]);
    advance(1000);
    const before = outbox().length;
    unwrap(repo.pages.recordSave(page, "c".repeat(64)));
    expect(repo.notebooks.list({ kind: "all" }).map((n) => n.id)).toEqual([notebook.id, other.id]);
    expect(
      outbox()
        .slice(before)
        .map((row) => [row.entity, row.entityId]),
    ).toEqual([["page", page]]);
  });

  test("a notebook opens on the page it was left on, else its first page", () => {
    const { repo, notebook, ids, outbox } = setup(3);
    const [first, second] = ids;
    if (first === undefined || second === undefined) throw new Error("setup");
    expect(repo.pages.openingPage(notebook.id, null)?.id).toBe(first);
    const before = outbox().length;
    repo.pages.rememberOpenPage(notebook.id, second);
    expect(outbox()).toHaveLength(before);
    expect(repo.pages.openingPage(notebook.id, null)?.id).toBe(second);
    unwrap(repo.pages.trash(second));
    expect(repo.pages.openingPage(notebook.id, null)?.id).toBe(first);
  });

  test("a requested page wins only when it is a live page of that notebook", () => {
    const { repo, notebook, ids } = setup(3);
    const [first, second, third] = ids;
    if (first === undefined || second === undefined || third === undefined) throw new Error("setup");
    repo.pages.rememberOpenPage(notebook.id, second);
    expect(repo.pages.openingPage(notebook.id, third)?.id).toBe(third);
    const elsewhere = unwrap(repo.notebooks.create(newNotebookInput("Other"))).firstPage;
    expect(repo.pages.openingPage(notebook.id, elsewhere.id)?.id).toBe(second);
    unwrap(repo.pages.trash(third));
    expect(repo.pages.openingPage(notebook.id, third)?.id).toBe(second);
  });

  test("countsByNotebook counts live pages per notebook in one query", () => {
    const { repo, notebook, ids } = setup(3);
    const other = unwrap(repo.notebooks.create(newNotebookInput("Other"))).notebook;
    const [, second] = ids;
    if (second === undefined) throw new Error("setup");
    unwrap(repo.pages.trash(second));
    const counts = repo.pages.countsByNotebook();
    expect(counts.get(notebook.id)).toBe(2);
    expect(counts.get(other.id)).toBe(1);
  });
});

describe("pages in bulk", () => {
  test("duplicateMany puts each copy right after its source, in one transaction", () => {
    const { repo, ids, order } = setup(3);
    const [a, b, c] = ids;
    if (a === undefined || b === undefined || c === undefined) throw new Error("setup");
    const [copyOfA, copyOfC] = unwrap(repo.pages.duplicateMany([c, a]));
    if (copyOfA === undefined || copyOfC === undefined) throw new Error("expected two copies");
    expect(order()).toEqual([a, copyOfA.page.id, b, c, copyOfC.page.id]);
  });

  test("trashMany keeps at least one page and trashes nothing otherwise", () => {
    const { repo, ids, order } = setup(3);
    expect(repo.pages.trashMany(ids)).toEqual({ ok: false, error: { code: "lastPage" } });
    expect(order()).toEqual(ids);
    const [a, b, c] = ids;
    if (a === undefined || b === undefined || c === undefined) throw new Error("setup");
    unwrap(repo.pages.trashMany([a, c]));
    expect(order()).toEqual([b]);
  });

  test("moveToNotebook appends pages to the target in order, keeping their files and sizes", () => {
    const { repo, notebook, ids, order, orderOf, outbox } = setup(3);
    const target = unwrap(repo.notebooks.create({ ...newNotebookInput("Target"), pageSize: PAGE_SIZES.whiteboard }));
    const [a, b, c] = ids;
    if (a === undefined || b === undefined || c === undefined) throw new Error("setup");
    const before = outbox().length;
    const moved = unwrap(repo.pages.moveToNotebook([c, a], target.notebook.id));
    expect(order()).toEqual([b]);
    expect(orderOf(target.notebook.id)).toEqual([target.firstPage.id, a, c]);
    expect(moved.map((page) => page.drawingPath)).toEqual([
      RelativePath.parse(`notebooks/${notebook.id}/${a}.drawing`),
      RelativePath.parse(`notebooks/${notebook.id}/${c}.drawing`),
    ]);
    expect(moved.every((page) => page.widthPt === PAGE_SIZES.a4Portrait.widthPt)).toBe(true);
    expect(
      outbox()
        .slice(before)
        .map((row) => row.entityId),
    ).toEqual([a, c]);
  });

  test("moveToNotebook refuses to empty the source or to use a missing target", () => {
    const { repo, ids } = setup(2);
    const target = unwrap(repo.notebooks.create(newNotebookInput("Target"))).notebook;
    expect(repo.pages.moveToNotebook(ids, target.id)).toEqual({ ok: false, error: { code: "lastPage" } });
    unwrap(repo.notebooks.trash(target.id));
    const [a] = ids;
    if (a === undefined) throw new Error("setup");
    expect(repo.pages.moveToNotebook([a], target.id)).toEqual({
      ok: false,
      error: { code: "notFound", entity: "notebook" },
    });
  });

  test("a page from another notebook or a missing page fails the whole batch", () => {
    const { repo, ids, order } = setup(2);
    const other = unwrap(repo.notebooks.create(newNotebookInput("Other"))).firstPage;
    const [a] = ids;
    if (a === undefined) throw new Error("setup");
    expect(repo.pages.duplicateMany([a, other.id])).toEqual({ ok: false, error: { code: "notFound", entity: "page" } });
    expect(repo.pages.duplicateMany([])).toEqual({ ok: false, error: { code: "notFound", entity: "page" } });
    expect(order()).toEqual(ids);
  });
});
