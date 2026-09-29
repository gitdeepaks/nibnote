import type { Folder } from "@nibnote/shared";
import { SymbolView, type SFSymbol } from "expo-symbols";
import { Pressable, ScrollView, Text, View, type GestureResponderEvent } from "react-native";
import { useRepository } from "../../db/DatabaseProvider";
import { colors } from "../../theme/colors";
import { anchorOf } from "../../components/popoverAnchor";
import { createFolder, showFolderActions } from "./libraryActions";
import type { LibrarySection } from "./sections";

export const SIDEBAR_WIDTH = 280;

type SidebarRowProps = {
  readonly icon: SFSymbol;
  readonly label: string;
  readonly selected: boolean;
  readonly indent: boolean;
  readonly onPress: () => void;
  readonly onLongPress: ((event: GestureResponderEvent) => void) | null;
};

function SidebarRow({ icon, label, selected, indent, onPress, onLongPress }: SidebarRowProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      {...(onLongPress === null ? {} : { onLongPress })}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        minHeight: 44,
        paddingLeft: indent ? 36 : 12,
        paddingRight: 12,
        borderRadius: 10,
        borderCurve: "continuous",
        backgroundColor: selected ? colors.fill : "transparent",
      }}
    >
      <SymbolView name={icon} size={20} tintColor={selected ? colors.tint : colors.secondaryLabel} />
      <Text numberOfLines={1} style={{ flex: 1, fontSize: 16, color: colors.label }}>
        {label}
      </Text>
    </Pressable>
  );
}

type LibrarySidebarProps = {
  readonly section: LibrarySection;
  readonly folders: readonly Folder[];
  readonly onSelect: (section: LibrarySection) => void;
};

export function LibrarySidebar({ section, folders, onSelect }: LibrarySidebarProps) {
  const repository = useRepository();
  const topLevel = folders.filter((folder) => folder.parentId === null);
  const isFolder = (folder: Folder) => section.kind === "folder" && section.folderId === folder.id;

  const folderRow = (folder: Folder, indent: boolean) => (
    <SidebarRow
      key={folder.id}
      icon={folder.role === "inbox" ? "tray" : "folder"}
      label={folder.name}
      indent={indent}
      selected={isFolder(folder)}
      onPress={() => {
        onSelect({ kind: "folder", folderId: folder.id });
      }}
      onLongPress={(event) => {
        showFolderActions(repository, folder, anchorOf(event));
      }}
    />
  );

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      // ScrollView defaults to flexGrow: 1, which would let the sidebar grab half the row.
      style={{ width: SIDEBAR_WIDTH, flexGrow: 0, flexShrink: 0, backgroundColor: colors.groupedBackground }}
      contentContainerStyle={{ padding: 12, gap: 2 }}
    >
      <SidebarRow
        icon="books.vertical"
        label="All Notebooks"
        selected={section.kind === "all"}
        onPress={() => {
          onSelect({ kind: "all" });
        }}
        indent={false}
        onLongPress={null}
      />
      <SidebarRow
        icon="star"
        label="Favourites"
        selected={section.kind === "favourites"}
        onPress={() => {
          onSelect({ kind: "favourites" });
        }}
        indent={false}
        onLongPress={null}
      />
      <SidebarRow
        icon="clock"
        label="Recents"
        selected={section.kind === "recents"}
        onPress={() => {
          onSelect({ kind: "recents" });
        }}
        indent={false}
        onLongPress={null}
      />
      <View
        style={{ flexDirection: "row", alignItems: "center", paddingTop: 18, paddingBottom: 4, paddingHorizontal: 12 }}
      >
        <Text style={{ flex: 1, fontSize: 13, fontWeight: "600", color: colors.secondaryLabel }}>FOLDERS</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="New folder"
          hitSlop={12}
          onPress={() => {
            createFolder(repository, null);
          }}
        >
          <SymbolView name="folder.badge.plus" size={20} tintColor={colors.tint} />
        </Pressable>
      </View>
      {topLevel.length === 0 && (
        <Text style={{ paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: colors.tertiaryLabel }}>
          No folders yet
        </Text>
      )}
      {topLevel.map((folder) => [
        folderRow(folder, false),
        ...folders.filter((child) => child.parentId === folder.id).map((child) => folderRow(child, true)),
      ])}
      <View style={{ height: 18 }} />
      <SidebarRow
        icon="trash"
        label="Trash"
        selected={section.kind === "trash"}
        onPress={() => {
          onSelect({ kind: "trash" });
        }}
        indent={false}
        onLongPress={null}
      />
    </ScrollView>
  );
}
