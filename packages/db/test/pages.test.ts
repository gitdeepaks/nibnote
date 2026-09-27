import { describe, expect, test } from "bun:test";
import { PAGE_SIZES, RelativePath, type NotebookId, type PageId } from "@nibnote/shared";
import { SORT_KEY_MAX_LENGTH } from "../src";
import { newNotebookInput, openTestDb, unwrap } from "./helpers";

function setup(pageCount: number) {
  const env = openTestDb();
  const { notebook, firstPage } = unwrap(env.repo.notebooks.create(newNotebookInput()));
  const ids: PageId[] = [firstPage.id];
  for (let i = 1; i < pageCount; i++) ids.push(unwrap(env.repo.pages.add(notebook.id)).id);
  const order = (id: NotebookId = notebook.id) => env.repo.pages.list(id).map((page) => page.id);
  return { ...env, notebook, ids, order };
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
    const page = unwrap(repo.pages.add(notebook.id));
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
