import { describe, expect, test } from "bun:test";
import { DEFAULT_FOLDER_NAME } from "@nibnote/shared";
import { newNotebookInput, openTestDb, unwrap } from "./helpers";

describe("folders", () => {
  test("one level of nesting: a subfolder can't have its own subfolder", () => {
    const { repo } = openTestDb();
    const top = unwrap(repo.folders.create({ name: "Study", parentId: null, role: null }));
    const child = unwrap(repo.folders.create({ name: "DSA", parentId: top.id, role: null }));
    expect(child.parentId).toBe(top.id);
    expect(repo.folders.create({ name: "Graphs", parentId: child.id, role: null })).toEqual({
      ok: false,
      error: { code: "folderTooDeep" },
    });
  });

  test("new folders go last and blank names get the default", () => {
    const { repo } = openTestDb();
    const a = unwrap(repo.folders.create({ name: "A", parentId: null, role: null }));
    const b = unwrap(repo.folders.create({ name: "  ", parentId: null, role: null }));
    expect(b.name).toBe(DEFAULT_FOLDER_NAME);
    expect(repo.folders.list().map((folder) => folder.id)).toEqual([a.id, b.id]);
  });

  test("trashing a folder takes its subfolders and notebooks; restore brings back only those", () => {
    const { repo, advance } = openTestDb();
    const top = unwrap(repo.folders.create({ name: "Study", parentId: null, role: null }));
    const child = unwrap(repo.folders.create({ name: "DSA", parentId: top.id, role: null }));
    const inTop = unwrap(repo.notebooks.create({ ...newNotebookInput("T"), folderId: top.id })).notebook;
    const inChild = unwrap(repo.notebooks.create({ ...newNotebookInput("C"), folderId: child.id })).notebook;
    const trashedEarlier = unwrap(repo.notebooks.create({ ...newNotebookInput("Old"), folderId: top.id })).notebook;
    unwrap(repo.notebooks.trash(trashedEarlier.id));
    advance(1000);

    unwrap(repo.folders.trash(top.id));
    expect(repo.folders.list()).toEqual([]);
    expect(repo.notebooks.list({ kind: "all" })).toEqual([]);

    unwrap(repo.folders.restore(top.id));
    expect(
      repo.folders
        .list()
        .map((folder) => folder.id)
        .sort(),
    ).toEqual([top.id, child.id].sort());
    expect(
      repo.notebooks
        .list({ kind: "all" })
        .map((n) => n.id)
        .sort(),
    ).toEqual([inTop.id, inChild.id].sort());
    expect(repo.notebooks.get(trashedEarlier.id)?.deletedAt).not.toBeNull();
  });
});
