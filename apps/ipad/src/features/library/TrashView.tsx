import { TRASH_RETENTION_DAYS } from "@nibnote/db";
import { Pressable, SectionList, Text, View } from "react-native";
import { useRepository } from "../../db/DatabaseProvider";
import { useLiveRead } from "../../db/useLiveRead";
import { colors } from "../../theme/colors";
import { EmptyState, LoadingState } from "../../components/EmptyState";
import { deleteItemForever, restoreItem, trashItemName, type TrashItem } from "./libraryActions";
import { relativeTime } from "./relativeTime";

const DAY_MS = 24 * 60 * 60 * 1000;

function trashedAt(item: TrashItem): number {
  const deletedAt =
    item.kind === "folder" ? item.folder.deletedAt : item.kind === "notebook" ? item.notebook.deletedAt : item.page.deletedAt;
  return deletedAt ?? 0;
}

function itemKey(item: TrashItem): string {
  return item.kind === "folder" ? item.folder.id : item.kind === "notebook" ? item.notebook.id : item.page.id;
}

function TrashRow({ item, now }: { readonly item: TrashItem; readonly now: number }) {
  const repository = useRepository();
  const at = trashedAt(item);
  const daysLeft = Math.max(0, Math.ceil((at + TRASH_RETENTION_DAYS * DAY_MS - now) / DAY_MS));
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 20 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text numberOfLines={1} style={{ fontSize: 16, color: colors.label }}>
          {trashItemName(item)}
        </Text>
        <Text style={{ fontSize: 13, color: colors.secondaryLabel }}>
          {`Trashed ${relativeTime(at, now)} · deleted in ${String(daysLeft)} ${daysLeft === 1 ? "day" : "days"}`}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        hitSlop={8}
        onPress={() => {
          restoreItem(repository, item);
        }}
      >
        <Text style={{ fontSize: 16, color: colors.tint }}>Restore</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        hitSlop={8}
        onPress={() => {
          deleteItemForever(repository, item);
        }}
      >
        <Text style={{ fontSize: 16, color: colors.destructive }}>Delete Forever</Text>
      </Pressable>
    </View>
  );
}

export function TrashView() {
  const trash = useLiveRead(["folders", "notebooks", "pages"], (repo) => {
    const contents = repo.trash.list();
    const pages: TrashItem[] = contents.pages.map((page) => ({
      kind: "page",
      page,
      notebookTitle: repo.notebooks.get(page.notebookId)?.title ?? "a notebook",
    }));
    return {
      now: Date.now(),
      sections: [
        { title: "Folders", data: contents.folders.map((folder): TrashItem => ({ kind: "folder", folder })) },
        { title: "Notebooks", data: contents.notebooks.map((notebook): TrashItem => ({ kind: "notebook", notebook })) },
        { title: "Pages", data: pages },
      ].filter((section) => section.data.length > 0),
    };
  });

  if (trash.status === "loading") return <LoadingState />;
  if (trash.status === "error") {
    return <EmptyState icon="exclamationmark.triangle" title="Couldn't load the trash" message={trash.message} />;
  }
  const { sections, now } = trash.value;
  if (sections.length === 0) {
    return (
      <EmptyState
        icon="trash"
        title="Trash is empty"
        message={`Deleted notebooks, folders and pages stay here for ${String(TRASH_RETENTION_DAYS)} days.`}
      />
    );
  }
  return (
    <SectionList
      contentInsetAdjustmentBehavior="automatic"
      sections={sections}
      keyExtractor={itemKey}
      renderSectionHeader={({ section }) => (
        <Text
          style={{
            paddingTop: 20,
            paddingBottom: 6,
            paddingHorizontal: 20,
            fontSize: 13,
            fontWeight: "600",
            color: colors.secondaryLabel,
            backgroundColor: colors.background,
          }}
        >
          {section.title.toUpperCase()}
        </Text>
      )}
      renderItem={({ item }) => <TrashRow item={item} now={now} />}
      ItemSeparatorComponent={() => <View style={{ height: 1, marginLeft: 20, backgroundColor: colors.separator }} />}
    />
  );
}
