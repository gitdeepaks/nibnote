import type { Page, PageId } from "@nibnote/shared";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { Stack } from "expo-router";
import { SymbolView, type SFSymbol } from "expo-symbols";
import { useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View, type GestureResponderEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { anchorOf } from "../../components/popoverAnchor";
import { colors } from "../../theme/colors";
import { gridLayout } from "./gridLayout";
import {
  chooseNotebookForPages,
  duplicatePages,
  movePageToIndex,
  trashPages,
  type PageActionContext,
} from "./pageActions";
import { PagePaper } from "./PagePaper";
import { useGridDrag } from "./useGridDrag";

type PageGridProps = {
  readonly pages: readonly Page[];
  readonly currentPageId: PageId;
  /** Built fresh for each action, so it always sees the live page order. */
  readonly actions: () => PageActionContext;
  readonly onOpenPage: (pageId: PageId) => void;
  readonly onClose: () => void;
};

/**
 * Every page of the notebook as a grid. Tap opens a page; long-press and drag reorders; Select
 * picks pages to duplicate, move to another notebook or trash. The canvas is unmounted meanwhile
 * (it saved on the way out), so only thumbnails are in memory.
 */
export function PageGrid({ pages, currentPageId, actions, onOpenPage, onClose }: PageGridProps) {
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlashListRef<Page>>(null);
  const [width, setWidth] = useState(0);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<PageId>>(new Set());
  const layout = gridLayout(width);
  const drag = useGridDrag({
    layout,
    count: pages.length,
    scrollTo: (offset) => {
      listRef.current?.scrollToOffset({ offset, animated: false });
    },
    onDrop: (pageId, targetIndex) => {
      movePageToIndex(actions(), pageId, targetIndex);
    },
  });

  // Selection only holds pages that still exist (another action may have removed some).
  const chosen = pages.filter((page) => selected.has(page.id)).map((page) => page.id);
  const allChosen = chosen.length === pages.length;
  const dragged = drag.drag === null ? undefined : pages.find((page) => page.id === drag.drag?.pageId);

  const endSelection = () => {
    setSelecting(false);
    setSelected(new Set());
  };

  const toggle = (pageId: PageId) => {
    const next = new Set(selected);
    if (next.has(pageId)) next.delete(pageId);
    else next.add(pageId);
    setSelected(next);
  };

  return (
    <>
      <Stack.Screen.Title>
        {selecting ? `${String(chosen.length)} Selected` : `${String(pages.length)} Pages`}
      </Stack.Screen.Title>
      <Stack.Toolbar placement="right">
        {/* The same button that opened the grid, in the same place, closes it. */}
        <Stack.Toolbar.Button icon="square.grid.2x2" accessibilityLabel="Back to the page" selected onPress={onClose} />
        {selecting && (
          <Stack.Toolbar.Button
            onPress={() => {
              setSelected(allChosen ? new Set() : new Set(pages.map((page) => page.id)));
            }}
          >
            {allChosen ? "Deselect All" : "Select All"}
          </Stack.Toolbar.Button>
        )}
        {selecting && <Stack.Toolbar.Button onPress={endSelection}>Cancel</Stack.Toolbar.Button>}
        {!selecting && (
          <Stack.Toolbar.Button
            onPress={() => {
              setSelecting(true);
            }}
          >
            Select
          </Stack.Toolbar.Button>
        )}
      </Stack.Toolbar>
      <View
        ref={drag.containerRef}
        style={{ flex: 1, backgroundColor: colors.groupedBackground }}
        onLayout={(event) => {
          setWidth(event.nativeEvent.layout.width);
          drag.measure();
        }}
        {...drag.panHandlers}
      >
        {width > 0 && (
          <FlashList
            key={layout.columns}
            ref={listRef}
            data={pages}
            numColumns={layout.columns}
            keyExtractor={(page) => page.id}
            extraData={{ selecting, selected, drag: drag.drag, currentPageId }}
            scrollEnabled={drag.drag === null}
            scrollEventThrottle={16}
            onScroll={(event) => {
              drag.setScrollY(event.nativeEvent.contentOffset.y);
            }}
            contentContainerStyle={{ padding: layout.padding, paddingBottom: layout.padding + insets.bottom + 72 }}
            renderItem={({ item, index }) => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Page ${String(index + 1)}`}
                accessibilityState={{ selected: selecting ? selected.has(item.id) : item.id === currentPageId }}
                accessibilityHint={selecting ? "Selects the page" : "Opens the page. Long press and drag to move it."}
                delayLongPress={250}
                onPress={() => {
                  if (selecting) toggle(item.id);
                  else onOpenPage(item.id);
                }}
                onLongPress={(event) => {
                  if (!selecting) drag.lift(item.id, index, event);
                }}
                onPressOut={drag.releaseIfStill}
                style={{
                  height: layout.cellHeight,
                  alignItems: "center",
                  paddingTop: 8,
                  gap: 6,
                  opacity: drag.drag?.pageId === item.id ? 0.3 : 1,
                }}
              >
                {drag.drag !== null && drag.drag.targetIndex === index && drag.drag.fromIndex !== index && (
                  // Where the dragged page will land.
                  <View
                    pointerEvents="none"
                    style={{
                      position: "absolute",
                      top: 2,
                      bottom: 2,
                      left: 6,
                      right: 6,
                      borderRadius: 10,
                      borderCurve: "continuous",
                      borderWidth: 2,
                      borderStyle: "dashed",
                      borderColor: colors.tint,
                    }}
                  />
                )}
                <View>
                  <PagePaper
                    page={item}
                    boxWidth={layout.boxWidth}
                    boxHeight={layout.boxHeight}
                    highlighted={selecting ? selected.has(item.id) : item.id === currentPageId}
                  />
                  {selecting && <SelectionMark on={selected.has(item.id)} />}
                </View>
                <Text style={{ fontSize: 13, fontVariant: ["tabular-nums"], color: colors.secondaryLabel }}>
                  {String(index + 1)}
                </Text>
              </Pressable>
            )}
          />
        )}
        {dragged !== undefined && (
          <Animated.View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: layout.cellWidth,
              alignItems: "center",
              paddingTop: 8,
              transform: [...drag.ghost.getTranslateTransform(), { scale: 1.06 }],
              boxShadow: "0 12px 28px rgba(0, 0, 0, 0.28)",
            }}
          >
            <PagePaper page={dragged} boxWidth={layout.boxWidth} boxHeight={layout.boxHeight} highlighted />
          </Animated.View>
        )}
        {selecting && chosen.length > 0 && (
          <SelectionBar
            count={chosen.length}
            bottom={insets.bottom + 16}
            onDuplicate={() => {
              void duplicatePages(actions(), chosen).then(endSelection);
            }}
            onMove={(event) => {
              chooseNotebookForPages(actions(), chosen, anchorOf(event));
            }}
            onTrash={() => {
              trashPages(actions(), chosen);
              endSelection();
            }}
          />
        )}
      </View>
    </>
  );
}

function SelectionMark({ on }: { readonly on: boolean }) {
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        right: 8,
        bottom: 8,
        width: 26,
        height: 26,
        borderRadius: 13,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: on ? colors.tint : "rgba(255, 255, 255, 0.85)",
        borderWidth: on ? 0 : 1.5,
        borderColor: colors.tertiaryLabel,
      }}
    >
      {on && <SymbolView name="checkmark" size={14} weight="bold" tintColor="#FFFFFF" />}
    </View>
  );
}

type SelectionBarProps = {
  readonly count: number;
  readonly bottom: number;
  readonly onDuplicate: () => void;
  readonly onMove: (event: GestureResponderEvent) => void;
  readonly onTrash: () => void;
};

/** Actions for the selected pages, floating above the grid. */
function SelectionBar({ count, bottom, onDuplicate, onMove, onTrash }: SelectionBarProps) {
  const pages = `${String(count)} ${count === 1 ? "page" : "pages"}`;
  return (
    <View pointerEvents="box-none" style={{ position: "absolute", left: 0, right: 0, bottom, alignItems: "center" }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          padding: 6,
          borderRadius: 28,
          borderCurve: "continuous",
          backgroundColor: colors.secondaryBackground,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.separator,
          boxShadow: "0 4px 16px rgba(0, 0, 0, 0.18)",
        }}
      >
        <BarButton icon="plus.square.on.square" label={`Duplicate ${pages}`} onPress={onDuplicate} />
        <BarButton icon="folder" label={`Move ${pages} to another notebook`} onPress={onMove} />
        <BarButton icon="trash" label={`Move ${pages} to the trash`} destructive onPress={onTrash} />
      </View>
    </View>
  );
}

type BarButtonProps = {
  readonly icon: SFSymbol;
  readonly label: string;
  readonly destructive?: boolean;
  readonly onPress: (event: GestureResponderEvent) => void;
};

function BarButton({ icon, label, destructive = false, onPress }: BarButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{ width: 48, height: 44, alignItems: "center", justifyContent: "center" }}
    >
      <SymbolView name={icon} size={22} tintColor={destructive ? colors.destructive : colors.tint} />
    </Pressable>
  );
}
