import type { Page, PageId } from "@nibnote/shared";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { Image } from "expo-image";
import { useEffect, useRef } from "react";
import { Pressable, StyleSheet, Text, View, type GestureResponderEvent } from "react-native";
import { thumbnailFile } from "../../db/files";
import { colors } from "../../theme/colors";
import { useThumbnailVersion } from "./thumbnailVersions";

export const PAGE_STRIP_WIDTH = 150;
const THUMBNAIL_WIDTH = 104;
/**
 * Every cell has the same height (an A4 portrait box; other page shapes fit inside it). Uniform
 * cells keep the virtualised layout exact in long notebooks: with mixed heights, jumping to a
 * page far down left gaps until the rows above were measured.
 */
const THUMBNAIL_BOX_HEIGHT = Math.round(THUMBNAIL_WIDTH * (842 / 595));
/** Pages are always white paper in v1.0 (the canvas renders in light appearance). */
const PAPER = "#FFFFFF";

type PageStripProps = {
  readonly pages: readonly Page[];
  readonly currentPageId: PageId;
  readonly onSelect: (pageId: PageId) => void;
  readonly onLongPress: (page: Page, pageNumber: number, event: GestureResponderEvent) => void;
};

/**
 * The notebook's pages as thumbnails, one column on the left. Virtualised, so a 300-page notebook
 * only renders what is on screen. It follows the current page as it changes.
 */
export function PageStrip({ pages, currentPageId, onSelect, onLongPress }: PageStripProps) {
  const listRef = useRef<FlashListRef<Page>>(null);
  const currentIndex = pages.findIndex((page) => page.id === currentPageId);

  useEffect(() => {
    if (currentIndex < 0) return;
    void listRef.current?.scrollToIndex({ index: currentIndex, animated: true, viewPosition: 0.5 });
  }, [currentIndex]);

  return (
    <View
      style={{
        width: PAGE_STRIP_WIDTH,
        borderRightWidth: StyleSheet.hairlineWidth,
        borderRightColor: colors.separator,
        backgroundColor: colors.secondaryBackground,
      }}
    >
      <FlashList
        ref={listRef}
        data={pages}
        extraData={currentPageId}
        keyExtractor={(page) => page.id}
        initialScrollIndex={Math.max(0, currentIndex)}
        contentContainerStyle={{ paddingVertical: 12 }}
        renderItem={({ item, index }) => (
          <PageThumbnail
            page={item}
            pageNumber={index + 1}
            selected={item.id === currentPageId}
            onPress={() => {
              onSelect(item.id);
            }}
            onLongPress={(event) => {
              onLongPress(item, index + 1, event);
            }}
          />
        )}
      />
    </View>
  );
}

type PageThumbnailProps = {
  readonly page: Page;
  readonly pageNumber: number;
  readonly selected: boolean;
  readonly onPress: () => void;
  readonly onLongPress: (event: GestureResponderEvent) => void;
};

function PageThumbnail({ page, pageNumber, selected, onPress, onLongPress }: PageThumbnailProps) {
  const version = useThumbnailVersion(page.id);
  // The page's own shape, as large as fits the uniform box.
  const scale = Math.min(THUMBNAIL_WIDTH / page.widthPt, THUMBNAIL_BOX_HEIGHT / page.heightPt);
  // A page that was never saved has no thumbnail file yet; it shows as blank paper.
  const hasThumbnail = page.thumbnailPath !== null || version > 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Page ${String(pageNumber)}`}
      accessibilityState={{ selected }}
      accessibilityHint="Long press for page options"
      onPress={onPress}
      onLongPress={onLongPress}
      style={{ alignItems: "center", gap: 6, paddingVertical: 8 }}
    >
      <View
        style={{ width: THUMBNAIL_WIDTH, height: THUMBNAIL_BOX_HEIGHT, alignItems: "center", justifyContent: "center" }}
      >
        <View
          style={{
            width: page.widthPt * scale,
            height: page.heightPt * scale,
            borderRadius: 4,
            borderCurve: "continuous",
            overflow: "hidden",
            backgroundColor: PAPER,
            borderWidth: selected ? 3 : StyleSheet.hairlineWidth,
            borderColor: selected ? colors.tint : colors.separator,
          }}
        >
          {hasThumbnail && (
            <Image
              source={{
                uri: thumbnailFile(page.id).uri,
                // The file is rewritten in place; a new save or render must not show the old image.
                cacheKey: `${page.id}:${page.drawingHash ?? "new"}:${String(version)}`,
              }}
              cachePolicy="memory"
              recyclingKey={page.id}
              contentFit="contain"
              transition={0}
              style={{ flex: 1 }}
            />
          )}
        </View>
      </View>
      <Text
        style={{
          fontSize: 12,
          fontVariant: ["tabular-nums"],
          fontWeight: selected ? "600" : "400",
          color: selected ? colors.tint : colors.secondaryLabel,
        }}
      >
        {String(pageNumber)}
      </Text>
    </Pressable>
  );
}
