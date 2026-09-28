import { describe, expect, test } from "bun:test";
import type { NotebookId } from "@nibnote/shared";
import { MAX_TABS } from "../src";
import { newNotebookInput, openTestDb, unwrap } from "./helpers";

function withNotebooks(count: number) {
  const env = openTestDb();
  const ids: NotebookId[] = [];
  for (let i = 0; i < count; i++) {
    ids.push(unwrap(env.repo.notebooks.create(newNotebookInput(`N${String(i)}`))).notebook.id);
    env.advance(1000);
  }
  const tabs = () => env.repo.tabs.list().map((notebook) => notebook.id);
  /** Opening a notebook in the editor: add its tab, then mark it opened. */
  const open = (id: NotebookId) => {
    env.repo.tabs.open(id);
    env.repo.notebooks.markOpened(id);
    env.advance(1000);
  };
  return { ...env, ids, tabs, open };
}

describe("tabs", () => {
  test("opening adds a tab on the right once, and nothing is queued for sync", () => {
    const { ids, tabs, open, outbox } = withNotebooks(3);
    const [a, b] = ids;
    if (a === undefined || b === undefined) throw new Error("setup");
    const before = outbox().length;
    open(a);
    open(b);
    open(a);
    expect(tabs()).toEqual([a, b]);
    expect(outbox()).toHaveLength(before);
  });

  test(`past ${String(MAX_TABS)} tabs, the one opened longest ago closes`, () => {
    const { ids, tabs, open } = withNotebooks(MAX_TABS + 1);
    ids.slice(0, MAX_TABS).forEach(open);
    const [first, second] = ids;
    if (first === undefined || second === undefined) throw new Error("setup");
    open(first);
    const newest = ids[MAX_TABS];
    if (newest === undefined) throw new Error("setup");
    open(newest);
    expect(tabs()).toHaveLength(MAX_TABS);
    expect(tabs()).not.toContain(second);
    expect(tabs()).toContain(first);
    expect(tabs().at(-1)).toBe(newest);
  });

  test("closing returns the right neighbour, else the left one, else nothing", () => {
    const { ids, tabs, open, repo } = withNotebooks(3);
    const [a, b, c] = ids;
    if (a === undefined || b === undefined || c === undefined) throw new Error("setup");
    [a, b, c].forEach(open);
    expect(repo.tabs.close(b)).toBe(c);
    expect(repo.tabs.close(c)).toBe(a);
    expect(repo.tabs.close(a)).toBeNull();
    expect(tabs()).toEqual([]);
  });

  test("a trashed notebook's tab disappears", () => {
    const { ids, tabs, open, repo } = withNotebooks(2);
    const [a, b] = ids;
    if (a === undefined || b === undefined) throw new Error("setup");
    [a, b].forEach(open);
    unwrap(repo.notebooks.trash(a));
    expect(tabs()).toEqual([b]);
  });
});
