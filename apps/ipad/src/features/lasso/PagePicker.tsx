import type { AreaSize, Page, PageId } from "@nibnote/shared";
import { FlashList } from "@shopify/flash-list";
import { SymbolView } from "expo-symbols";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../../theme/colors";
import { gridLayout } from "../editor/gridLayout";
import { PagePaper } from "../editor/PagePaper";

/** Where the selection goes: a page of this notebook, or a new one after the current page. */
export type PagePickerChoice =
  { readonly kind: "new" } | { readonly kind: "page"; readonly page: Page; readonly number: number };

type PagePickerProps = {
  readonly pages: readonly Page[];
  readonly currentPageId: PageId;
  /** The page area the picker covers. */
  readonly area: AreaSize;
  readonly onChoose: (choice: PagePickerChoice) => void;
  readonly onClose: () => void;
};

const MARGIN = 24;
const MAX_WIDTH = 620;
const HEADER = 52;

/**
 * Picks the page a lasso selection is copied to. It covers the page instead of replacing it: the
 * canvas stays mounted underneath, because the selection only exists there.
 */
export function PagePicker({ pages, currentPageId, area, onChoose, onClose }: PagePickerProps) {
  const width = Math.max(0, Math.min(MAX_WIDTH, area.width - MARGIN * 2));
  const height = Math.max(0, area.height - MARGIN * 2);
  const layout = gridLayout(width);
  const choices: readonly PagePickerChoice[] = [
    { kind: "new" },
    ...pages.flatMap((page, index): readonly PagePickerChoice[] =>
      page.id === currentPageId ? [] : [{ kind: "page", page, number: index + 1 }],
    ),
  ];

  return (
    <View style={StyleSheet.absoluteFill} accessibilityViewIsModal onAccessibilityEscape={onClose}>
      <Pressable
        style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0, 0, 0, 0.3)" }]}
        accessible={false}
        importantForAccessibility="no"
        onPress={onClose}
      />
      <View
        style={{
          position: "absolute",
          top: MARGIN,
          left: (area.width - width) / 2,
          width,
          maxHeight: height,
          borderRadius: 18,
          borderCurve: "continuous",
          backgroundColor: colors.groupedBackground,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.separator,
          boxShadow: "0 12px 40px rgba(0, 0, 0, 0.3)",
          overflow: "hidden",
        }}
      >
        <View
          style={{
            height: HEADER,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 16,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.separator,
          }}
        >
          <Text accessibilityRole="header" style={{ fontSize: 17, fontWeight: "600", color: colors.label }}>
            Duplicate to page
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Cancel" hitSlop={12} onPress={onClose}>
            <Text style={{ fontSize: 17, color: colors.tint }}>Cancel</Text>
          </Pressable>
        </View>
        <View style={{ height: Math.max(0, Math.min(height - HEADER, rowsHeight(choices.length, layout))) }}>
          <FlashList
            key={layout.columns}
            data={choices}
            numColumns={layout.columns}
            keyExtractor={(choice) => (choice.kind === "new" ? "new" : choice.page.id)}
            contentContainerStyle={{ padding: layout.padding }}
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={item.kind === "new" ? "New page" : `Page ${String(item.number)}`}
                accessibilityHint="Copies the selection there"
                onPress={() => {
                  onChoose(item);
                }}
                style={{ height: layout.cellHeight, alignItems: "center", paddingTop: 8, gap: 6 }}
              >
                {item.kind === "new" ? (
                  <View
                    style={{
                      width: layout.boxWidth,
                      height: layout.boxHeight,
                      alignItems: "center",
                      justifyContent: "center",
                      borderWidth: 2,
                      borderStyle: "dashed",
                      borderColor: colors.tint,
                      borderRadius: 6,
                    }}
                  >
                    <SymbolView name="plus" size={28} weight="semibold" tintColor={colors.tint} />
                  </View>
                ) : (
                  <PagePaper
                    page={item.page}
                    boxWidth={layout.boxWidth}
                    boxHeight={layout.boxHeight}
                    highlighted={false}
                  />
                )}
                <Text style={{ fontSize: 13, fontVariant: ["tabular-nums"], color: colors.secondaryLabel }}>
                  {item.kind === "new" ? "New page" : String(item.number)}
                </Text>
              </Pressable>
            )}
          />
        </View>
      </View>
    </View>
  );
}

/** The grid's full height, so a notebook with few pages gets a short card. */
function rowsHeight(count: number, layout: ReturnType<typeof gridLayout>): number {
  return Math.ceil(count / layout.columns) * layout.cellHeight + layout.padding * 2;
}
