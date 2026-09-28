import type { DrawingPolicy, Notebook, NotebookId, Page, PageId, PageSwipeEvent, PencilActionEvent } from "@nibnote/shared";
import { router, Stack } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Alert, Animated, Easing, Text, View } from "react-native";
import { PencilCanvas, type PencilCanvasRef } from "../../../modules/pencil-canvas";
import { EmptyState, LoadingState } from "../../components/EmptyState";
import { anchorOf } from "../../components/popoverAnchor";
import { useRepository } from "../../db/DatabaseProvider";
import { drawingFileUri } from "../../db/files";
import { useLiveRead } from "../../db/useLiveRead";
import { colors } from "../../theme/colors";
import { CanvasBanner } from "./CanvasBanner";
import { canvasMessageFor, type CanvasMessage } from "./canvasMessages";
import { addDevPages, DEV_PAGE_BATCH, DEV_STROKE_FILLS } from "./developerTools";
import { addPageAfter, showPageActions, type PageActionContext } from "./pageActions";
import { PageStrip } from "./PageStrip";
import { ToolPalette } from "./ToolPalette";
import { DEFAULT_PEN_COLOR, toolAfterPencilAction, toolFor, type ToolKey } from "./tools";

/** Missing, trashed or malformed notebook: shown for bad deep links and for notebooks trashed meanwhile. */
export function NotebookNotFound() {
  return (
    <>
      <Stack.Screen.Title>Not Found</Stack.Screen.Title>
      <EmptyState
        icon="book.closed"
        title="Notebook not found"
        message="It may have been moved to the trash or deleted."
        action={{
          label: "Back to Library",
          onPress: () => {
            router.dismissTo("/");
          },
        }}
      />
    </>
  );
}

/** Loads the notebook and its pages live, then shows one page at a time on a single canvas. */
export function Editor({ notebookId }: { readonly notebookId: NotebookId }) {
  const repository = useRepository();
  const session = useLiveRead(
    ["notebooks", "pages"],
    (repo) => ({ notebook: repo.notebooks.getLive(notebookId) ?? null, pages: repo.pages.list(notebookId) }),
    notebookId,
  );
  // The live read catches up a frame after a write, so a page that was just added isn't in
  // `pages` yet; until it is, the page on screen stays (`fallbackId`). If both are gone (trashed
  // elsewhere), the page at the same position shows instead of jumping back to page 1.
  const [selection, setSelection] = useState<{
    readonly pageId: PageId | null;
    readonly fallbackId: PageId | null;
    readonly fallbackIndex: number;
  }>(() => ({ pageId: repository.pages.openingPage(notebookId)?.id ?? null, fallbackId: null, fallbackIndex: 0 }));

  useEffect(() => {
    repository.notebooks.markOpened(notebookId);
  }, [repository, notebookId]);

  if (session.status === "loading") return <LoadingState />;
  if (session.status === "error") {
    return <EmptyState icon="exclamationmark.triangle" title="Couldn't open the notebook" message={session.message} />;
  }
  const { notebook, pages } = session.value;
  const indexOf = (pageId: PageId | null) => pages.findIndex((candidate) => candidate.id === pageId);
  const found = indexOf(selection.pageId);
  const fallback = indexOf(selection.fallbackId);
  const index =
    found >= 0 ? found : fallback >= 0 ? fallback : Math.max(0, Math.min(selection.fallbackIndex, pages.length - 1));
  // A notebook always keeps one live page, so an empty list means it was trashed meanwhile.
  const page = pages[index];
  if (notebook === null || page === undefined) return <NotebookNotFound />;
  return (
    <PageEditor
      notebook={notebook}
      pages={pages}
      page={page}
      pageNumber={index + 1}
      onShowPage={(pageId) => {
        setSelection({ pageId, fallbackId: page.id, fallbackIndex: index });
      }}
    />
  );
}

type PageEditorProps = {
  readonly notebook: Notebook;
  readonly pages: readonly Page[];
  readonly page: Page;
  readonly pageNumber: number;
  readonly onShowPage: (pageId: PageId) => void;
};

/** How far a page slides in when turned by a swipe, in points. */
const PAGE_TURN_DISTANCE = 48;

/** Whether the page strip is open, kept while the app runs (persisted in Phase 3). */
const stripPreference = { open: false };

/**
 * The single mounted canvas. Changing `page` swaps the canvas's page in place: the native view
 * saves the outgoing page from a snapshot and loads the next one, so only one canvas ever exists.
 */
function PageEditor({ notebook, pages, page, pageNumber, onShowPage }: PageEditorProps) {
  const pageCount = pages.length;
  const repository = useRepository();
  const canvasRef = useRef<PencilCanvasRef>(null);
  const [tool, setTool] = useState<ToolKey>("pen");
  const [previousTool, setPreviousTool] = useState<ToolKey>("pen");
  const [penColor, setPenColor] = useState(DEFAULT_PEN_COLOR);
  const [policy, setPolicy] = useState<DrawingPolicy>("pencilOnly");
  const [history, setHistory] = useState({ pageId: page.id, canUndo: false, canRedo: false });
  const [notice, setNotice] = useState<{ readonly pageId: PageId; readonly message: CanvasMessage } | null>(null);
  const [stripOpen, setStripOpen] = useState(stripPreference.open);
  const [turn] = useState(() => ({ offset: new Animated.Value(0), opacity: new Animated.Value(1) }));

  useEffect(() => {
    repository.pages.rememberOpenPage(notebook.id, page.id);
  }, [repository, notebook.id, page.id]);

  // Events carry their page, so a late event from the previous page never shows on this one.
  const canUndo = history.pageId === page.id && history.canUndo;
  const canRedo = history.pageId === page.id && history.canRedo;
  const message = notice?.pageId === page.id ? notice.message : null;

  const selectTool = (next: ToolKey) => {
    if (next === tool) return;
    setPreviousTool(tool);
    setTool(next);
  };

  const handlePencilAction = (event: PencilActionEvent) => {
    selectTool(toolAfterPencilAction(event.preferredAction, tool, previousTool));
  };

  const pageActions = (): PageActionContext => ({
    repository,
    notebookId: notebook.id,
    order: pages.map((candidate) => candidate.id),
    currentPageId: page.id,
    canvas: canvasRef.current,
    showPage: onShowPage,
  });

  const handlePageSwipe = (event: PageSwipeEvent) => {
    if (event.pageId !== page.id) return;
    const forward = event.direction === "next";
    const target = pages[pageNumber - 1 + (forward ? 1 : -1)];
    if (target === undefined) return;
    onShowPage(target.id);
    // A short slide in the swipe's direction, so the page change reads as turning a page.
    turn.offset.setValue(forward ? PAGE_TURN_DISTANCE : -PAGE_TURN_DISTANCE);
    turn.opacity.setValue(0.4);
    const timing = { duration: 180, easing: Easing.out(Easing.poly(3)), useNativeDriver: true };
    Animated.parallel([
      Animated.timing(turn.offset, { ...timing, toValue: 0 }),
      Animated.timing(turn.opacity, { ...timing, toValue: 1 }),
    ]).start();
  };

  const run = (label: string, action: (canvas: PencilCanvasRef) => Promise<void>) => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    void (async () => {
      try {
        await action(canvas);
      } catch (error) {
        console.error(`${label} failed`, error instanceof Error ? error.message : String(error));
      }
    })();
  };

  return (
    <>
      <Stack.Screen.Title>{notebook.title}</Stack.Screen.Title>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon="sidebar.left"
          accessibilityLabel={stripOpen ? "Hide pages" : "Show pages"}
          selected={stripOpen}
          onPress={() => {
            stripPreference.open = !stripOpen;
            setStripOpen(!stripOpen);
          }}
        />
        <Stack.Toolbar.Button
          icon="doc.badge.plus"
          accessibilityLabel="Add a page after this one"
          onPress={() => {
            addPageAfter(pageActions(), page.id);
          }}
        />
        <Stack.Toolbar.Button
          icon="arrow.uturn.backward"
          accessibilityLabel="Undo"
          disabled={!canUndo}
          onPress={() => {
            run("Undo", (canvas) => canvas.undo());
          }}
        />
        <Stack.Toolbar.Button
          icon="arrow.uturn.forward"
          accessibilityLabel="Redo"
          disabled={!canRedo}
          onPress={() => {
            run("Redo", (canvas) => canvas.redo());
          }}
        />
        {__DEV__ && (
          <Stack.Toolbar.Menu icon="hammer" accessibilityLabel="Developer tools">
            {DEV_STROKE_FILLS.map((count) => (
              <Stack.Toolbar.MenuAction
                key={count}
                icon="scribble"
                onPress={() => {
                  run("Fill strokes", (canvas) => canvas.debugFillStrokes(count));
                }}
              >
                {`Fill ${String(count)} strokes`}
              </Stack.Toolbar.MenuAction>
            ))}
            <Stack.Toolbar.MenuAction
              icon="doc.on.doc"
              onPress={() => {
                const added = addDevPages(repository, notebook.id, DEV_PAGE_BATCH);
                Alert.alert(
                  `${String(added)} pages added`,
                  `This notebook now has ${String(pageCount + added)} pages.`,
                );
              }}
            >
              {`Add ${String(DEV_PAGE_BATCH)} pages`}
            </Stack.Toolbar.MenuAction>
          </Stack.Toolbar.Menu>
        )}
      </Stack.Toolbar>
      <View style={{ flex: 1, flexDirection: "row" }}>
        {stripOpen && (
          <PageStrip
            pages={pages}
            currentPageId={page.id}
            onSelect={onShowPage}
            onLongPress={(target, number, event) => {
              showPageActions(pageActions(), target, number, anchorOf(event));
            }}
          />
        )}
        <View style={{ flex: 1, backgroundColor: colors.groupedBackground }}>
          <Animated.View style={{ flex: 1, opacity: turn.opacity, transform: [{ translateX: turn.offset }] }}>
            <PencilCanvas
              ref={canvasRef}
              style={{ flex: 1 }}
              pageId={page.id}
              drawingFileUri={drawingFileUri(page)}
              pageSize={{ widthPt: page.widthPt, heightPt: page.heightPt }}
              template={page.template}
              tool={toolFor(tool, penColor)}
              drawingPolicy={policy}
              onDrawingChanged={(event) => {
                setHistory({ pageId: event.pageId, canUndo: event.canUndo, canRedo: event.canRedo });
              }}
              onPencilAction={handlePencilAction}
              onCanvasError={(event) => {
                console.warn(`Canvas ${event.code} on page ${event.pageId}: ${event.message}`);
                const next = canvasMessageFor(event);
                if (next !== null) setNotice({ pageId: event.pageId, message: next });
              }}
              onPageSwipe={handlePageSwipe}
            />
          </Animated.View>
          <ToolPalette
            tool={tool}
            penColor={penColor}
            policy={policy}
            onSelectTool={selectTool}
            onSelectPenColor={(color) => {
              setPenColor(color);
              selectTool("pen");
            }}
            onTogglePolicy={() => {
              setPolicy(policy === "pencilOnly" ? "anyInput" : "pencilOnly");
            }}
          />
          <View pointerEvents="box-none" style={{ position: "absolute", top: 12, left: 0, right: 0, gap: 8 }}>
            <Text
              accessibilityLabel={`Page ${String(pageNumber)} of ${String(pageCount)}`}
              style={{
                alignSelf: "flex-end",
                marginRight: 16,
                paddingVertical: 4,
                paddingHorizontal: 10,
                borderRadius: 10,
                overflow: "hidden",
                fontSize: 13,
                fontVariant: ["tabular-nums"],
                color: colors.secondaryLabel,
                backgroundColor: colors.secondaryBackground,
              }}
            >
              {`${String(pageNumber)} / ${String(pageCount)}`}
            </Text>
            {message !== null && (
              <CanvasBanner
                message={message}
                onDismiss={() => {
                  setNotice(null);
                }}
              />
            )}
          </View>
        </View>
      </View>
    </>
  );
}
