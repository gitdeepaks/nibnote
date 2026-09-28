import type { Notebook, NotebookId } from "@nibnote/shared";
import { router } from "expo-router";
import { SymbolView } from "expo-symbols";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRepository } from "../../db/DatabaseProvider";
import { useLiveRead } from "../../db/useLiveRead";
import { colors } from "../../theme/colors";

/**
 * Tabs for the notebooks open in the editor, under the header. Shown once two or more are open.
 * Switching changes the route's params in place, so tabs never pile up screens on the stack.
 */
export function NotebookTabs({ currentId }: { readonly currentId: NotebookId }) {
  const repository = useRepository();
  const tabs = useLiveRead(["settings", "notebooks"], (repo) => repo.tabs.list());
  if (tabs.status !== "ready" || tabs.value.length < 2) return null;

  const show = (id: NotebookId) => {
    router.setParams({ notebookId: id, page: undefined });
  };

  const close = (tab: Notebook) => {
    const next = repository.tabs.close(tab.id);
    if (tab.id !== currentId) return;
    if (next === null) router.dismissTo("/");
    else show(next);
  };

  return (
    <View style={{ borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 6, gap: 6 }}
      >
        {tabs.value.map((tab) => {
          const current = tab.id === currentId;
          return (
            <View
              key={tab.id}
              style={{
                flexDirection: "row",
                alignItems: "center",
                borderRadius: 10,
                borderCurve: "continuous",
                backgroundColor: current ? colors.secondaryBackground : "transparent",
              }}
            >
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected: current }}
                accessibilityLabel={tab.title}
                disabled={current}
                onPress={() => {
                  show(tab.id);
                }}
                style={{ paddingLeft: 12, paddingRight: 4, paddingVertical: 7, maxWidth: 200 }}
              >
                <Text
                  numberOfLines={1}
                  style={{ fontSize: 14, fontWeight: current ? "600" : "400", color: current ? colors.label : colors.secondaryLabel }}
                >
                  {tab.title}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Close ${tab.title}`}
                hitSlop={8}
                onPress={() => {
                  close(tab);
                }}
                style={{ paddingLeft: 4, paddingRight: 10, paddingVertical: 7 }}
              >
                <SymbolView name="xmark" size={10} weight="semibold" tintColor={colors.secondaryLabel} />
              </Pressable>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}
