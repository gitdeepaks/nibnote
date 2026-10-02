import {
  canvasToolFor,
  hasToolOptions,
  pencilResponse,
  type AreaSize,
  type CanvasPoint,
  type Notebook,
  type NotebookId,
  type Page,
  type PageId,
  type HistoryGestureEvent,
  type PageSwipeEvent,
  type PencilActionEvent,
  type PencilSurface,
} from "@nibnote/shared";
import { router, Stack } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Animated, AppState, Easing, Text, View } from "react-native";
import { PencilCanvas, type PencilCanvasRef } from "../../../modules/pencil-canvas";
import { EmptyState, LoadingState } from "../../components/EmptyState";
import { anchorOf } from "../../components/popoverAnchor";
import { useRepository } from "../../db/DatabaseProvider";
import { drawingFileUri } from "../../db/files";
import { useLiveRead } from "../../db/useLiveRead";
import { colors } from "../../theme/colors";
import { CanvasBanner } from "./CanvasBanner";
import { formatLocalDate } from "./dates";
import { HistoryHud, type HistoryNotice } from "./HistoryHud";
import { canvasMessageFor, type CanvasMessage } from "./canvasMessages";
import { env } from "../../lib/env";
import {
  addDevPages,
  checkDrawingFiles,
  clearThumbnailCache,
  DEV_PAGE_BATCH,
  DEV_STROKE_FILLS,
} from "./developerTools";
import { lastOpenMs, stopOpenTimer } from "./openTimer";
import { addPageAfter, showPageActions, type PageActionContext } from "./pageActions";
import { PageGrid } from "./PageGrid";
import { PageStrip } from "./PageStrip";
import { RadialPalette } from "../pencil/RadialPalette";
import { TipOptions } from "../pencil/TipOptions";
import { Toolbar } from "../toolbar/Toolbar";
import { useToolbox } from "../toolbar/ToolboxProvider";
import { useToolbarCollapse } from "../toolbar/useToolbarCollapse";

/** What is open at the Pencil's tip, for which page and page-area size. */
type OpenAtPencil = {
  /** Changes with every opening, so the palette animates in again. */
  readonly id: number;
  readonly surface: PencilSurface;
  readonly point: CanvasPoint | null;
  readonly pageId: PageId;
  readonly area: AreaSize;
};

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
export function Editor({
  notebookId,
  initialPageId,
}: {
  readonly notebookId: NotebookId;
  /** A page to open on (Daily note, deep link); otherwise the page the notebook was left on. */
  readonly initialPageId: PageId | null;
}) {
  const repository = useRepository();
  const session = useLiveRead(
    ["notebooks", "pages"],
    (repo) => ({
      notebook: repo.notebooks.getLive(notebookId) ?? null,
      pages: repo.pages.list(notebookId),
    }),
    notebookId,
  );
  // The live read catches up a frame after a write, so a page that was just added isn't in
  // `pages` yet; until it is, the page on screen stays (`fallbackId`). If both are gone (trashed
  // elsewhere), the page at the same position shows instead of jumping back to page 1.
  const [selection, setSelection] = useState<{
    readonly pageId: PageId | null;
    readonly fallbackId: PageId | null;
    readonly fallbackIndex: number;
  }>(() => ({
    // The requested page (Daily note, deep link) is used only if it is a live page of this notebook.
    pageId: repository.pages.openingPage(notebookId, initialPageId)?.id ?? null,
    fallbackId: null,
    fallbackIndex: 0,
  }));

  useEffect(() => {
    // The tab is added before marking it opened, so it never evicts itself.
    repository.tabs.open(notebookId);
    repository.notebooks.markOpened(notebookId);
  }, [repository, notebookId]);

  if (session.status === "loading") return <LoadingState />;
  if (session.status === "error") {
    return (
      <EmptyState
        icon="exclamationmark.triangle"
        title="Couldn't open the notebook"
        message={session.message}
        action={null}
      />
    );
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

/** The diagnostics menu: development builds, or release builds made with EXPO_PUBLIC_DIAGNOSTICS=1. */
const showsDiagnostics = __DEV__ || env.diagnostics;

function formatOpenTime(ms: number | null): string {
  return ms === null ? "open a notebook from the library" : `${String(ms)} ms`;
}

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
  const toolbox = useToolbox((state) => state.toolbox);
  const toolActions = useToolbox((state) => state.actions);
  const toolbarCollapse = useToolbarCollapse();
  // A new tool object only when the tools change, so the canvas re-applies it only then.
  const tool = useMemo(() => canvasToolFor(toolbox), [toolbox]);
  const [history, setHistory] = useState({
    pageId: page.id,
    canUndo: false,
    canRedo: false,
  });
  const [notice, setNotice] = useState<{
    readonly pageId: PageId;
    readonly message: CanvasMessage;
  } | null>(null);
  const [stripOpen, setStripOpen] = useState(stripPreference.open);
  const [showingGrid, setShowingGrid] = useState(false);
  const [historyNotice, setHistoryNotice] = useState<HistoryNotice | null>(null);
  // The page area (the canvas and everything over it), where the Pencil's palette is placed.
  const [area, setArea] = useState<AreaSize>({ width: 0, height: 0 });
  const [pencilOpen, setPencilOpen] = useState<OpenAtPencil | null>(null);
  // Bumped when something opens at the Pencil, so a toolbar popover closes.
  const [toolbarDismiss, setToolbarDismiss] = useState(0);
  const [turn] = useState(() => ({
    offset: new Animated.Value(0),
    opacity: new Animated.Value(1),
  }));

  useEffect(() => {
    repository.pages.rememberOpenPage(notebook.id, page.id);
  }, [repository, notebook.id, page.id]);

  // Leaving the app closes whatever is open at the Pencil.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") setPencilOpen(null);
    });
    return () => {
      subscription.remove();
    };
  }, []);

  // Events carry their page, so a late event from the previous page never shows on this one.
  const canUndo = history.pageId === page.id && history.canUndo;
  const canRedo = history.pageId === page.id && history.canRedo;
  const message = notice?.pageId === page.id ? notice.message : null;

  const handleHistoryGesture = (event: HistoryGestureEvent) => {
    if (event.pageId !== page.id) return;
    setHistoryNotice((previous) => ({
      id: (previous?.id ?? 0) + 1,
      action: event.action,
      applied: event.applied,
    }));
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
    const timing = {
      duration: 180,
      easing: Easing.out(Easing.poly(3)),
      useNativeDriver: true,
    };
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

  // A palette or options popover belongs to the page and window size it opened for: turning the
  // page, resizing or rotating closes it.
  const atPencil =
    pencilOpen !== null &&
    pencilOpen.pageId === page.id &&
    pencilOpen.area.width === area.width &&
    pencilOpen.area.height === area.height
      ? pencilOpen
      : null;

  const openAtPencil = (surface: PencilSurface, point: CanvasPoint | null) => {
    setPencilOpen((previous) => ({ id: (previous?.id ?? 0) + 1, surface, point, pageId: page.id, area }));
    setToolbarDismiss((count) => count + 1);
  };

  const pencilFeedback = (at: CanvasPoint | null) => {
    run("Pencil feedback", (canvas) => canvas.toolFeedback(at));
  };

  const handlePencilAction = (event: PencilActionEvent) => {
    if (event.pageId !== page.id) return;
    const response = pencilResponse(event.kind, event.preferredAction, atPencil?.surface ?? null);
    switch (response.kind) {
      case "switchTool":
        toolActions.applyPencilAction(response.action);
        pencilFeedback(event.location);
        if (!response.keepOpen) setPencilOpen(null);
        return;
      case "open":
        if (response.surface === "options" && !hasToolOptions(toolbox)) {
          setPencilOpen(null);
          return;
        }
        openAtPencil(response.surface, event.location);
        return;
      case "close":
        setPencilOpen(null);
        return;
      case "none":
        return;
    }
  };

  if (showingGrid) {
    return (
      <PageGrid
        pages={pages}
        currentPageId={page.id}
        actions={pageActions}
        onOpenPage={(pageId) => {
          onShowPage(pageId);
          setShowingGrid(false);
        }}
        onClose={() => {
          setShowingGrid(false);
        }}
      />
    );
  }

  return (
    <>
      <Stack.Screen.Title>{notebook.title}</Stack.Screen.Title>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon="square.grid.2x2"
          accessibilityLabel="All pages"
          onPress={() => {
            setShowingGrid(true);
          }}
        />
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
        {showsDiagnostics && (
          <Stack.Toolbar.Menu icon="hammer" accessibilityLabel="Diagnostics">
            <Stack.Toolbar.MenuAction icon="stopwatch" disabled>
              {`Last open: ${formatOpenTime(lastOpenMs())}`}
            </Stack.Toolbar.MenuAction>
            <Stack.Toolbar.MenuAction
              icon="checkmark.shield"
              onPress={() => {
                const check = checkDrawingFiles(repository);
                Alert.alert(
                  check.missing === 0 ? "All drawings are on disk" : `${String(check.missing)} drawings are missing`,
                  `${String(check.pages)} pages, ${String(check.drawn)} with drawings.`,
                );
              }}
            >
              Check Files
            </Stack.Toolbar.MenuAction>
            <Stack.Toolbar.MenuAction
              icon="photo.badge.exclamationmark"
              onPress={() => {
                clearThumbnailCache();
                Alert.alert("Thumbnails cleared", "Open the page strip or grid: thumbnails should come back.");
              }}
            >
              Clear Thumbnails
            </Stack.Toolbar.MenuAction>
            {__DEV__ &&
              DEV_STROKE_FILLS.map((count) => (
                <Stack.Toolbar.MenuAction
                  key={count}
                  icon="scribble"
                  onPress={() => {
                    run("Fill strokes", (canvas) => canvas.debugFillStrokes(count, false));
                  }}
                >
                  {`Fill ${String(count)} strokes`}
                </Stack.Toolbar.MenuAction>
              ))}
            {__DEV__ && (
              <Stack.Toolbar.MenuAction
                icon="hand.pinch"
                onPress={() => {
                  run("Simulate squeeze", (canvas) => canvas.debugPencilAction("squeeze"));
                }}
              >
                Simulate Apple Pencil squeeze
              </Stack.Toolbar.MenuAction>
            )}
            {__DEV__ && (
              <Stack.Toolbar.MenuAction
                icon="highlighter"
                onPress={() => {
                  run("Fill strokes", (canvas) => canvas.debugFillStrokes(2000, true));
                }}
              >
                Fill 2000 strokes, half highlighter
              </Stack.Toolbar.MenuAction>
            )}
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
        <View
          style={{ flex: 1, backgroundColor: colors.groupedBackground }}
          onLayout={(event) => {
            const { width, height } = event.nativeEvent.layout;
            setArea({ width, height });
          }}
        >
          <Animated.View
            style={{
              flex: 1,
              opacity: turn.opacity,
              transform: [{ translateX: turn.offset }],
            }}
          >
            <PencilCanvas
              ref={canvasRef}
              debugSystemToolPicker={false}
              style={{ flex: 1 }}
              pageId={page.id}
              drawingFileUri={drawingFileUri(page)}
              pageSize={{ widthPt: page.widthPt, heightPt: page.heightPt }}
              template={page.template}
              tool={tool}
              drawingPolicy={toolbox.drawingPolicy}
              onDrawingChanged={(event) => {
                stopOpenTimer(notebook.id);
                setHistory({
                  pageId: event.pageId,
                  canUndo: event.canUndo,
                  canRedo: event.canRedo,
                });
              }}
              onPencilAction={handlePencilAction}
              onCanvasError={(event) => {
                console.warn(`Canvas ${event.code} on page ${event.pageId}: ${event.message}`);
                const next = canvasMessageFor(event);
                if (next !== null) setNotice({ pageId: event.pageId, message: next });
              }}
              onPageSwipe={handlePageSwipe}
              onToolUsage={(event) => {
                if (event.pageId === page.id) toolbarCollapse.toolUsage(event.active);
              }}
              onHistoryGesture={handleHistoryGesture}
            />
          </Animated.View>
          <Toolbar
            canUndo={canUndo}
            canRedo={canRedo}
            onUndo={() => {
              run("Undo", (canvas) => canvas.undo());
            }}
            onRedo={() => {
              run("Redo", (canvas) => canvas.redo());
            }}
            collapsed={toolbarCollapse.collapsed}
            onExpand={toolbarCollapse.expand}
            dismissPopovers={toolbarDismiss}
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
              {page.dailyDate === null
                ? `${String(pageNumber)} / ${String(pageCount)}`
                : `${formatLocalDate(page.dailyDate)} · ${String(pageNumber)} / ${String(pageCount)}`}
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
          {historyNotice !== null && <HistoryHud notice={historyNotice} dock={toolbox.dock} />}
          {atPencil?.surface === "palette" && (
            <RadialPalette
              key={atPencil.id}
              point={atPencil.point}
              area={area}
              onPicked={pencilFeedback}
              onOptions={() => {
                openAtPencil("options", atPencil.point);
              }}
              onClose={() => {
                setPencilOpen(null);
              }}
            />
          )}
          {atPencil?.surface === "options" && (
            <TipOptions
              key={atPencil.id}
              point={atPencil.point}
              area={area}
              onClose={() => {
                setPencilOpen(null);
              }}
            />
          )}
        </View>
      </View>
    </>
  );
}
