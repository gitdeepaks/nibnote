import type { Notebook } from "@nibnote/shared";
import { SymbolView } from "expo-symbols";
import { Pressable, StyleSheet, Text, View, type GestureResponderEvent } from "react-native";
import { colors } from "../../theme/colors";
import { relativeTime } from "./relativeTime";

type NotebookCardProps = {
  readonly notebook: Notebook;
  readonly pageCount: number;
  readonly now: number;
  readonly onLongPress: (event: GestureResponderEvent) => void;
};

/** A cover shaped like the notebook's pages, with the title and details underneath. */
export function NotebookCard({ notebook, pageCount, now, onLongPress }: NotebookCardProps) {
  const aspectRatio = Math.min(Math.max(notebook.pageSize.widthPt / notebook.pageSize.heightPt, 0.6), 1.5);
  const pages = `${String(pageCount)} ${pageCount === 1 ? "page" : "pages"}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${notebook.title}, ${pages}`}
      accessibilityHint="Long press for options"
      onLongPress={onLongPress}
      style={{ gap: 8, padding: 8 }}
    >
      <View style={{ height: 180, alignItems: "center", justifyContent: "flex-end" }}>
        <View
          style={{
            height: aspectRatio > 1 ? 180 / aspectRatio : 180,
            aspectRatio,
            borderRadius: 10,
            borderCurve: "continuous",
            backgroundColor: notebook.coverColor,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.separator,
            boxShadow: "0 2px 6px rgba(0, 0, 0, 0.18)",
          }}
        >
          {notebook.isFavourite && (
            <View style={{ position: "absolute", top: 8, right: 8 }}>
              <SymbolView name="star.fill" size={18} tintColor={colors.favourite} />
            </View>
          )}
        </View>
      </View>
      <Text numberOfLines={2} style={{ fontSize: 15, fontWeight: "600", textAlign: "center", color: colors.label }}>
        {notebook.title}
      </Text>
      <Text numberOfLines={1} style={{ fontSize: 12, textAlign: "center", color: colors.secondaryLabel }}>
        {`${pages} · ${relativeTime(notebook.updatedAt, now)}`}
      </Text>
    </Pressable>
  );
}
