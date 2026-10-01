import { describe, expect, test } from "bun:test";
import {
  CanvasErrorEvent,
  CanvasTool,
  DrawingChangedEvent,
  FileUri,
  HexColor,
  PAGE_SIZES,
  PageSize,
  PageTemplate,
  PencilActionEvent,
  SaveResult,
  DrawingSavedEvent,
  PageSwipeEvent,
  ThumbnailWrittenEvent,
  ToolUsageEvent,
} from "./index";

const pageId = "8f14e45f-ceea-467a-9575-5e1b5c6d7a10";
const drawingUri = "file:///var/mobile/Containers/Data/Application/X/Documents/notebooks/n/p.drawing";
const sha256 = "a".repeat(64);

describe("HexColor", () => {
  test("accepts #RRGGBB and #RRGGBBAA", () => {
    expect(HexColor.safeParse("#1C1C1E").success).toBe(true);
    expect(HexColor.safeParse("#ffcc0080").success).toBe(true);
  });

  test("rejects short, named and malformed colours", () => {
    for (const value of ["#fff", "red", "1C1C1E", "#1C1C1G", "#1C1C1E8"]) {
      expect(HexColor.safeParse(value).success).toBe(false);
    }
  });
});

describe("FileUri", () => {
  test("accepts absolute file URLs only", () => {
    expect(FileUri.safeParse(drawingUri).success).toBe(true);
    expect(FileUri.safeParse("https://example.com/p.drawing").success).toBe(false);
    expect(FileUri.safeParse("/var/mobile/p.drawing").success).toBe(false);
    expect(FileUri.safeParse("file://").success).toBe(false);
  });
});

describe("CanvasTool", () => {
  test("accepts every tool kind", () => {
    const tools = [
      { kind: "ink", ink: "fountainPen", colorHex: "#1C1C1E", width: 3 },
      { kind: "highlighter", colorHex: "#FFD60A", width: 18 },
      { kind: "eraser", mode: "pixel", width: 12 },
      { kind: "eraser", mode: "stroke", width: 12 },
      { kind: "lasso" },
    ];
    for (const tool of tools) {
      expect(CanvasTool.safeParse(tool).success).toBe(true);
    }
  });

  test("rejects unknown inks, bad colours, bad widths and missing fields", () => {
    const tools = [
      { kind: "ink", ink: "crayon", colorHex: "#1C1C1E", width: 3 },
      { kind: "ink", ink: "pen", colorHex: "black", width: 3 },
      { kind: "ink", ink: "pen", colorHex: "#1C1C1E", width: 0 },
      { kind: "highlighter", colorHex: "#FFD60A", width: 101 },
      { kind: "eraser", mode: "soft", width: 12 },
      { kind: "eraser", width: 12 },
      { kind: "brush" },
    ];
    for (const tool of tools) {
      expect(CanvasTool.safeParse(tool).success).toBe(false);
    }
  });
});

describe("PageTemplate", () => {
  test("accepts blank, ruled and cornell templates", () => {
    for (const template of [
      { kind: "blank" },
      { kind: "lined", spacingPt: 24 },
      { kind: "grid", spacingPt: 20 },
      { kind: "dotted", spacingPt: 16 },
      { kind: "cornell" },
    ]) {
      expect(PageTemplate.safeParse(template).success).toBe(true);
    }
  });

  test("requires a sane spacing for ruled templates", () => {
    expect(PageTemplate.safeParse({ kind: "lined" }).success).toBe(false);
    expect(PageTemplate.safeParse({ kind: "grid", spacingPt: 1 }).success).toBe(false);
  });
});

describe("PAGE_SIZES", () => {
  test("every preset is a valid PageSize", () => {
    for (const size of Object.values(PAGE_SIZES)) {
      expect(PageSize.safeParse(size).success).toBe(true);
    }
  });

  test("whiteboard is three A4 landscape pages per side", () => {
    expect(PAGE_SIZES.a4Landscape.widthPt * 3).toBe(PAGE_SIZES.whiteboard.widthPt);
    expect(PAGE_SIZES.a4Landscape.heightPt * 3).toBe(PAGE_SIZES.whiteboard.heightPt);
  });
});

describe("native events", () => {
  test("parse well-formed payloads", () => {
    expect(
      DrawingChangedEvent.safeParse({
        pageId,
        strokeCount: 12,
        canUndo: true,
        canRedo: false,
        hasUnsavedChanges: true,
      }).success,
    ).toBe(true);
    expect(
      PencilActionEvent.safeParse({
        pageId,
        kind: "tap",
        preferredAction: "switchEraser",
      }).success,
    ).toBe(true);
    expect(
      CanvasErrorEvent.safeParse({
        pageId,
        code: "recoveredFromBackup",
        message: "loaded .bak",
      }).success,
    ).toBe(true);
    expect(
      SaveResult.safeParse({
        fileUri: drawingUri,
        sha256,
        thumbnailUri: drawingUri,
        strokeCount: 500,
      }).success,
    ).toBe(true);
  });

  test("reject payloads that drift from the contract", () => {
    expect(
      DrawingChangedEvent.safeParse({
        pageId,
        strokeCount: -1,
        canUndo: true,
        canRedo: false,
        hasUnsavedChanges: true,
      }).success,
    ).toBe(false);
    expect(
      PencilActionEvent.safeParse({
        pageId,
        kind: "hover",
        preferredAction: "ignore",
      }).success,
    ).toBe(false);
    expect(
      CanvasErrorEvent.safeParse({
        pageId: "not-a-uuid",
        code: "saveFailed",
        message: "",
      }).success,
    ).toBe(false);
    expect(
      SaveResult.safeParse({
        fileUri: drawingUri,
        sha256: "ABC",
        thumbnailUri: drawingUri,
        strokeCount: 1,
      }).success,
    ).toBe(false);
  });
});

describe("module events", () => {
  test("a saved drawing carries its page, hash and stroke count", () => {
    expect(DrawingSavedEvent.safeParse({ pageId, sha256, strokeCount: 12 }).success).toBe(true);
    expect(ThumbnailWrittenEvent.safeParse({ pageId }).success).toBe(true);
  });

  test("reject payloads that drift from the contract", () => {
    expect(DrawingSavedEvent.safeParse({ pageId, sha256: "A".repeat(64), strokeCount: 1 }).success).toBe(false);
    expect(DrawingSavedEvent.safeParse({ pageId, sha256, strokeCount: -1 }).success).toBe(false);
    expect(ThumbnailWrittenEvent.safeParse({ pageId: "page-1" }).success).toBe(false);
  });
});

describe("PageSwipeEvent", () => {
  test("carries the page and a direction", () => {
    expect(PageSwipeEvent.safeParse({ pageId, direction: "next" }).success).toBe(true);
    expect(PageSwipeEvent.safeParse({ pageId, direction: "previous" }).success).toBe(true);
  });

  test("rejects unknown directions", () => {
    expect(PageSwipeEvent.safeParse({ pageId, direction: "up" }).success).toBe(false);
  });
});

describe("ToolUsageEvent", () => {
  test("parses a page id and whether a tool is touching the page", () => {
    const event = ToolUsageEvent.parse({ pageId, active: true });
    expect(event.active).toBe(true);
    expect(String(event.pageId)).toBe(pageId);
    expect(ToolUsageEvent.safeParse({ pageId, active: "yes" }).success).toBe(false);
    expect(ToolUsageEvent.safeParse({ pageId: "nope", active: false }).success).toBe(false);
  });
});
