import { describe, expect, test } from "bun:test";
import {
  DEFAULT_NOTEBOOK_TITLE,
  Notebook,
  normaliseTitle,
  Page,
  RelativePath,
  TITLE_MAX_LENGTH,
} from "./index";

const notebookId = "8f14e45f-ceea-467a-9575-5e1b5c6d7a10";
const pageId = "2c1d0e7a-5b8f-4a3e-9d6c-1f2e3a4b5c6d";

describe("normaliseTitle", () => {
  test("trims whitespace", () => {
    expect(normaliseTitle("  DSA notes  ", DEFAULT_NOTEBOOK_TITLE)).toBe("DSA notes");
  });

  test("empty or blank input falls back to the default name", () => {
    expect(normaliseTitle("", DEFAULT_NOTEBOOK_TITLE)).toBe(DEFAULT_NOTEBOOK_TITLE);
    expect(normaliseTitle(" \n\t ", DEFAULT_NOTEBOOK_TITLE)).toBe(DEFAULT_NOTEBOOK_TITLE);
  });

  test("keeps emoji intact", () => {
    expect(normaliseTitle("📐 System design 🧠", DEFAULT_NOTEBOOK_TITLE)).toBe("📐 System design 🧠");
  });

  test("cuts long titles at a character boundary, never inside an emoji", () => {
    const long = "🧠".repeat(TITLE_MAX_LENGTH + 50);
    const result = normaliseTitle(long, DEFAULT_NOTEBOOK_TITLE);
    expect(Array.from(result)).toHaveLength(TITLE_MAX_LENGTH);
    expect(result).toBe("🧠".repeat(TITLE_MAX_LENGTH));
  });
});

describe("RelativePath", () => {
  test("accepts paths inside the container", () => {
    expect(RelativePath.safeParse(`notebooks/${notebookId}/${pageId}.drawing`).success).toBe(true);
    expect(RelativePath.safeParse(`thumbs/${pageId}.png`).success).toBe(true);
  });

  test("rejects absolute paths, URLs and parent traversal", () => {
    for (const path of [
      "/var/mobile/Containers/Data/Application/X/Documents/p.drawing",
      "file:///var/mobile/p.drawing",
      "notebooks/../../etc/passwd",
      "",
    ]) {
      expect(RelativePath.safeParse(path).success).toBe(false);
    }
  });
});

describe("library domain schemas", () => {
  const lifecycle = { createdAt: 1_790_000_000_000, updatedAt: 1_790_000_000_000, deletedAt: null };

  test("a notebook needs a valid cover colour, page size and template", () => {
    const notebook = {
      id: notebookId,
      folderId: null,
      title: "DSA",
      coverColor: "#0A60FF",
      pageSize: { widthPt: 595, heightPt: 842 },
      defaultTemplate: { kind: "lined", spacingPt: 24 },
      isFavourite: false,
      lastOpenedAt: null,
      ...lifecycle,
    };
    expect(Notebook.safeParse(notebook).success).toBe(true);
    expect(Notebook.safeParse({ ...notebook, coverColor: "blue" }).success).toBe(false);
    expect(Notebook.safeParse({ ...notebook, defaultTemplate: { kind: "music" } }).success).toBe(false);
  });

  test("a page stores relative paths and its own size", () => {
    const page = {
      id: pageId,
      notebookId,
      sortKey: "a0",
      template: { kind: "blank" },
      widthPt: 842,
      heightPt: 595,
      drawingPath: `notebooks/${notebookId}/${pageId}.drawing`,
      drawingHash: null,
      thumbnailPath: null,
      ...lifecycle,
    };
    expect(Page.safeParse(page).success).toBe(true);
    expect(Page.safeParse({ ...page, drawingPath: `/abs/${pageId}.drawing` }).success).toBe(false);
    expect(Page.safeParse({ ...page, widthPt: 0 }).success).toBe(false);
    expect(Page.safeParse({ ...page, drawingHash: "abc" }).success).toBe(false);
  });
});
