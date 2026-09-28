import { neighbourAfterRemoval, placementFor, type PageMove, type Repository } from "@nibnote/db";
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
  const { page, copyFrom, copyTo } = result.value;
  try {
    const drawing = new File(Paths.document, copyFrom);
    // A page that was never written has no file yet; its copy starts blank the same way.
    if (drawing.exists) await drawing.copy(new File(Paths.document, copyTo));
    const thumbnail = thumbnailFile(pageId);
    if (thumbnail.exists) {
      await thumbnail.copy(thumbnailFile(page.id));
      markThumbnailWritten(page.id);
    }
    if (saved.kind === "saved") context.repository.pages.recordSave(page.id, saved.sha256);
  } catch (error) {
    console.warn("Copying a duplicated page's files failed", error instanceof Error ? error.message : String(error));
    Alert.alert("The copy is blank", "The page was added, but its drawing couldn't be copied.");
  }
  context.showPage(page.id);
}

type SaveOutcome =
  | { readonly kind: "skipped" }
  | { readonly kind: "saved"; readonly sha256: string }
  | { readonly kind: "failed" };

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
export function showPageActions(context: PageActionContext, page: Page, pageNumber: number, anchor?: number): void {
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
      anchor,
    },
    (index) => {
      choices[index]?.run();
    },
  );
}
