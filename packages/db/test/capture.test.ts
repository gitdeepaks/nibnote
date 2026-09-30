import { describe, expect, test } from "bun:test";
import { DAILY_NOTEBOOK_TITLE, INBOX_FOLDER_NAME, LocalDate } from "@nibnote/shared";
import { newNotebookInput, openTestDb, unwrap } from "./helpers";

const monday = LocalDate.parse("2026-09-28");
const tuesday = LocalDate.parse("2026-09-29");

describe("daily note", () => {
  test("creates the Daily notebook and today's page once, however often it is opened", () => {
    const { repo } = openTestDb();
    const first = unwrap(repo.capture.openDailyPage(monday));
    const again = unwrap(repo.capture.openDailyPage(monday));
    expect(again).toEqual(first);
    const daily = repo.notebooks.getLive(first.notebookId);
    expect(daily?.title).toBe(DAILY_NOTEBOOK_TITLE);
    expect(daily?.role).toBe("daily");
    const pages = repo.pages.list(first.notebookId);
    expect(pages.map((page) => [page.id, page.dailyDate, page.template.kind])).toEqual([
      [first.pageId, monday, "blank"],
    ]);
  });

  test("a new day adds a page at the end of the same notebook", () => {
    const { repo } = openTestDb();
    const mondayPage = unwrap(repo.capture.openDailyPage(monday));
    const tuesdayPage = unwrap(repo.capture.openDailyPage(tuesday));
    expect(tuesdayPage.notebookId).toBe(mondayPage.notebookId);
    expect(repo.pages.list(mondayPage.notebookId).map((page) => page.dailyDate)).toEqual([monday, tuesday]);
  });

  test("a trashed day or Daily notebook is made again, and renaming it changes nothing", () => {
    const { repo } = openTestDb();
    const first = unwrap(repo.capture.openDailyPage(monday));
    unwrap(repo.capture.openDailyPage(tuesday));
    unwrap(repo.notebooks.update(first.notebookId, { kind: "rename", title: "Journal" }));
    unwrap(repo.pages.trash(first.pageId));
    const remade = unwrap(repo.capture.openDailyPage(monday));
    expect(remade.notebookId).toBe(first.notebookId);
    expect(remade.pageId).not.toBe(first.pageId);
    unwrap(repo.notebooks.trash(first.notebookId));
    const fresh = unwrap(repo.capture.openDailyPage(monday));
    expect(fresh.notebookId).not.toBe(first.notebookId);
  });

  test("an ordinary notebook's pages never count as a day", () => {
    const { repo } = openTestDb();
    const other = unwrap(repo.notebooks.create(newNotebookInput("DSA"))).firstPage;
    expect(other.dailyDate).toBeNull();
    const copy = unwrap(repo.capture.openDailyPage(monday));
    const duplicate = unwrap(repo.pages.duplicate(copy.pageId)).page;
    expect(duplicate.dailyDate).toBeNull();
    expect(unwrap(repo.capture.openDailyPage(monday)).pageId).toBe(copy.pageId);
  });
});

describe("quick note", () => {
  test("each quick note is a new one-page notebook in the Inbox folder, listed first", () => {
    const { repo, advance } = openTestDb();
    unwrap(repo.folders.create({ name: "Work", parentId: null, role: null }));
    const first = unwrap(repo.capture.createQuickNote("Quick Note · 28 Sep, 10:42"));
    advance(1000);
    const second = unwrap(repo.capture.createQuickNote("Quick Note · 28 Sep, 10:43"));
    const [inbox, work] = repo.folders.list();
    expect(inbox?.name).toBe(INBOX_FOLDER_NAME);
    expect(inbox?.role).toBe("inbox");
    expect(work?.name).toBe("Work");
    expect(first.notebook.folderId).toBe(inbox?.id ?? null);
    expect(second.notebook.folderId).toBe(inbox?.id ?? null);
    expect(first.notebook.id).not.toBe(second.notebook.id);
    expect(repo.pages.list(first.notebook.id)).toHaveLength(1);
    expect(first.firstPage.template).toEqual({ kind: "blank" });
  });

  test("a trashed Inbox is made again", () => {
    const { repo } = openTestDb();
    const first = unwrap(repo.capture.createQuickNote("One"));
    const inboxId = first.notebook.folderId;
    if (inboxId === null) throw new Error("expected an inbox");
    unwrap(repo.folders.trash(inboxId));
    const second = unwrap(repo.capture.createQuickNote("Two"));
    expect(second.notebook.folderId).not.toBe(inboxId);
    expect(repo.folders.list().map((folder) => folder.role)).toEqual(["inbox"]);
  });
});
