import { describe, expect, test } from "bun:test";
import type { PageId } from "@nibnote/shared";
import { neighbourAfterRemoval, placementFor, type PageMove } from "../src";
import { newNotebookInput, openTestDb, unwrap } from "./helpers";

function notebookWithPages(count: number) {
  const env = openTestDb();
  const { notebook, firstPage } = unwrap(env.repo.notebooks.create(newNotebookInput()));
  const ids: PageId[] = [firstPage.id];
  for (let i = 1; i < count; i++) ids.push(unwrap(env.repo.pages.add(notebook.id)).id);
  const order = () => env.repo.pages.list(notebook.id).map((page) => page.id);
  /** Applies a menu move through the repository, like the editor does. */
  const apply = (pageId: PageId, move: PageMove) => {
    const placement = placementFor(order(), pageId, move);
    if (placement !== null) unwrap(env.repo.pages.move(pageId, placement));
    return placement;
  };
  return { ids, order, apply };
}

function nth(ids: readonly PageId[], index: number): PageId {
  const id = ids[index];
  if (id === undefined) throw new Error(`no page at ${String(index)}`);
  return id;
}

describe("placementFor", () => {
  test("earlier and later swap a page with its neighbour", () => {
    const { ids, order, apply } = notebookWithPages(4);
    const [a, b, c, d] = [nth(ids, 0), nth(ids, 1), nth(ids, 2), nth(ids, 3)];
    apply(c, "earlier");
    expect(order()).toEqual([a, c, b, d]);
    apply(c, "earlier");
    expect(order()).toEqual([c, a, b, d]);
    apply(a, "later");
    expect(order()).toEqual([c, b, a, d]);
  });

  test("start and end move a page to either end", () => {
    const { ids, order, apply } = notebookWithPages(4);
    const [a, b, c, d] = [nth(ids, 0), nth(ids, 1), nth(ids, 2), nth(ids, 3)];
    apply(c, "start");
    expect(order()).toEqual([c, a, b, d]);
    apply(a, "end");
    expect(order()).toEqual([c, b, d, a]);
  });

  test("a page can't move past an end, and an unknown page has no placement", () => {
    const { ids, apply } = notebookWithPages(3);
    const [first, last] = [nth(ids, 0), nth(ids, 2)];
    expect(apply(first, "start")).toBeNull();
    expect(apply(first, "earlier")).toBeNull();
    expect(apply(last, "later")).toBeNull();
    expect(apply(last, "end")).toBeNull();
    expect(placementFor(ids.slice(1), first, "later")).toBeNull();
  });
});

describe("neighbourAfterRemoval", () => {
  test("prefers the next page, then the previous one", () => {
    const { ids } = notebookWithPages(3);
    const [a, b, c] = [nth(ids, 0), nth(ids, 1), nth(ids, 2)];
    expect(neighbourAfterRemoval(ids, b)).toBe(c);
    expect(neighbourAfterRemoval(ids, c)).toBe(b);
    expect(neighbourAfterRemoval([a], a)).toBeNull();
    expect(neighbourAfterRemoval([b, c], a)).toBeNull();
  });
});
