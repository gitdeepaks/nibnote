import {
  nearestRemaining,
  neighbourAfterRemoval,
  placementFor,
  placementForIndex,
  type DuplicatedPage,
  type PageMove,
  type Repository,
} from "@nibnote/db";
import type { NotebookId, Page, PageId } from "@nibnote/shared";
import { File, Paths } from "expo-file-system";
import { ActionSheetIOS, Alert } from "react-native";
import type { PencilCanvasRef } from "../../../modules/pencil-canvas";
import { thumbnailFile } from "../../db/files";
import { reportFailure } from "../../db/reportFailure";
import { markThumbnailWritten } from "./thumbnailVersions";

// Page operations for the editor. Each one writes through the repository (and its outbox) and
// reports failures to the user; the editor only decides which page to show afterwards.

export type PageActionContext = {
  readonly repository: Repository;
  readonly notebookId: NotebookId;
  /** The live page order on screen. */
  readonly order: readonly PageId[];
  readonly currentPageId: PageId;
  readonly canvas: PencilCanvasRef | null;
  readonly showPage: (pageId: PageId) => void;
};

export function addPageAfter(context: PageActionContext, afterId: PageId): void {
  const result = context.repository.pages.add(context.notebookId, afterId);
  if (reportFailure(result, "add a page")) context.showPage(result.value.id);
}

/**
 * Copies a page right after itself. The current page is saved first, so the copy includes the
 * latest strokes; the thumbnail is copied too, so the strip shows the copy at once.
 */
export async function duplicatePage(context: PageActionContext, pageId: PageId): Promise<void> {
  const saved: SaveOutcome = pageId === context.currentPageId ? await saveCurrent(context.canvas) : { kind: "skipped" };
  if (saved.kind === "failed") {
    Alert.alert("Couldn't duplicate the page", "The page couldn't be saved first, so nothing was copied.");
    return;
  }
  const result = context.repository.pages.duplicate(pageId);
  if (!reportFailure(result, "duplicate the page")) return;
  if (!(await copyPageFiles(context, result.value, saved))) {
    Alert.alert("The copy is blank", "The page was added, but its drawing couldn't be copied.");
  }
  context.showPage(result.value.page.id);
}

/** Duplicates the selected pages (each copy right after its source) and copies their files. */
export async function duplicatePages(context: PageActionContext, pageIds: readonly PageId[]): Promise<void> {
  const saved: SaveOutcome = pageIds.includes(context.currentPageId)
    ? await saveCurrent(context.canvas)
    : { kind: "skipped" };
  if (saved.kind === "failed") {
    Alert.alert("Couldn't duplicate the pages", "The current page couldn't be saved first, so nothing was copied.");
    return;
  }
  const result = context.repository.pages.duplicateMany(pageIds);
  if (!reportFailure(result, "duplicate the pages")) return;
  let blank = 0;
  for (const copy of result.value) {
    if (!(await copyPageFiles(context, copy, saved))) blank += 1;
  }
  if (blank > 0) {
    Alert.alert("Some copies are blank", `${String(blank)} of the copied pages couldn't get their drawing.`);
  }
}

/**
 * Copies a duplicated page's drawing and thumbnail. A page that was never written has no file yet;
 * its copy starts blank the same way. Returns false when a copy failed.
 */
async function copyPageFiles(context: PageActionContext, copy: DuplicatedPage, saved: SaveOutcome): Promise<boolean> {
  try {
    const drawing = new File(Paths.document, copy.copyFrom);
    if (drawing.exists) await drawing.copy(new File(Paths.document, copy.copyTo));
    const thumbnail = thumbnailFile(copy.sourceId);
    if (thumbnail.exists) {
      await thumbnail.copy(thumbnailFile(copy.page.id));
      markThumbnailWritten(copy.page.id);
    }
    // The current page's hash is known from the save that preceded the copy.
    if (saved.kind === "saved" && copy.sourceId === context.currentPageId) {
      context.repository.pages.recordSave(copy.page.id, saved.sha256);
    }
    return true;
  } catch (error) {
    console.warn("Copying a duplicated page's files failed", error instanceof Error ? error.message : String(error));
    return false;
  }
}

type SaveOutcome =
  { readonly kind: "skipped" } | { readonly kind: "saved"; readonly sha256: string } | { readonly kind: "failed" };

async function saveCurrent(canvas: PencilCanvasRef | null): Promise<SaveOutcome> {
  if (canvas === null) return { kind: "skipped" };
  try {
    return { kind: "saved", sha256: (await canvas.save()).sha256 };
  } catch {
    return { kind: "failed" };
  }
}

export function trashPage(context: PageActionContext, pageId: PageId): void {
  const next = pageId === context.currentPageId ? neighbourAfterRemoval(context.order, pageId) : null;
  if (!reportFailure(context.repository.pages.trash(pageId), "move the page to the trash")) return;
  if (next !== null) context.showPage(next);
}

/** Trashes the selected pages; when the current page is among them, the nearest remaining page shows. */
export function trashPages(context: PageActionContext, pageIds: readonly PageId[]): void {
  const next = pageIds.includes(context.currentPageId)
    ? nearestRemaining(context.order, pageIds, context.currentPageId)
    : null;
  if (!reportFailure(context.repository.pages.trashMany(pageIds), "move the pages to the trash")) return;
  if (next !== null) context.showPage(next);
}

/** Moves the selected pages to the end of another notebook. */
export function movePagesToNotebook(context: PageActionContext, pageIds: readonly PageId[], target: NotebookId): void {
  const next = pageIds.includes(context.currentPageId)
    ? nearestRemaining(context.order, pageIds, context.currentPageId)
    : null;
  if (!reportFailure(context.repository.pages.moveToNotebook(pageIds, target), "move the pages")) return;
  if (next !== null) context.showPage(next);
}

/** Lets the user pick the notebook to move the selected pages into. */
export function chooseNotebookForPages(
  context: PageActionContext,
  pageIds: readonly PageId[],
  anchor: number | null,
): void {
  const notebooks = context.repository.notebooks.list({ kind: "all" }).filter((n) => n.id !== context.notebookId);
  if (notebooks.length === 0) {
    Alert.alert("No other notebooks", "Create another notebook to move pages into it.");
    return;
  }
  const count = pageIds.length;
  const options = [...notebooks.map((notebook) => notebook.title), "Cancel"];
  ActionSheetIOS.showActionSheetWithOptions(
    {
      title: `Move ${String(count)} ${count === 1 ? "page" : "pages"} to`,
      options,
      cancelButtonIndex: notebooks.length,
      // The popover points at the pressed view when there is one.
      ...(anchor === null ? {} : { anchor }),
    },
    (index) => {
      const target = notebooks[index];
      if (target !== undefined) movePagesToNotebook(context, pageIds, target.id);
    },
  );
}

/** Drops a dragged page at `targetIndex` in the page order. */
export function movePageToIndex(context: PageActionContext, pageId: PageId, targetIndex: number): void {
  const placement = placementForIndex(context.order, pageId, targetIndex);
  if (placement === null) return;
  reportFailure(context.repository.pages.move(pageId, placement), "move the page");
}

export function movePage(context: PageActionContext, pageId: PageId, move: PageMove): void {
  const placement = placementFor(context.order, pageId, move);
  if (placement === null) return;
  reportFailure(context.repository.pages.move(pageId, placement), "move the page");
}

const MOVES: readonly { readonly move: PageMove; readonly label: string }[] = [
  { move: "start", label: "Move to Start" },
  { move: "earlier", label: "Move Earlier" },
  { move: "later", label: "Move Later" },
  { move: "end", label: "Move to End" },
];

/** The page menu, as a popover anchored to the long-pressed thumbnail. */
export function showPageActions(
  context: PageActionContext,
  page: Page,
  pageNumber: number,
  anchor: number | null,
): void {
  const choices: readonly { readonly label: string; readonly run: () => void }[] = [
    {
      label: "Add Page After",
      run: () => {
        addPageAfter(context, page.id);
      },
    },
    {
      label: "Duplicate",
      run: () => {
        void duplicatePage(context, page.id);
      },
    },
    ...MOVES.filter(({ move }) => placementFor(context.order, page.id, move) !== null).map(({ move, label }) => ({
      label,
      run: () => {
        movePage(context, page.id, move);
      },
    })),
    {
      label: "Move to Trash",
      run: () => {
        trashPage(context, page.id);
      },
    },
  ];
  const options = [...choices.map((choice) => choice.label), "Cancel"];
  ActionSheetIOS.showActionSheetWithOptions(
    {
      title: `Page ${String(pageNumber)}`,
      options,
      cancelButtonIndex: choices.length,
      destructiveButtonIndex: choices.length - 1,
      // The popover points at the pressed view when there is one.
      ...(anchor === null ? {} : { anchor }),
    },
    (index) => {
      choices[index]?.run();
    },
  );
}
