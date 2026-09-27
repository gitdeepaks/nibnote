import { router, Stack, useLocalSearchParams } from "expo-router";
import { useWindowDimensions, View } from "react-native";
import { useLiveRead } from "../db/useLiveRead";
import { showSectionPicker } from "../features/library/libraryActions";
import { LibrarySidebar, SIDEBAR_WIDTH } from "../features/library/LibrarySidebar";
import { NotebookGrid } from "../features/library/NotebookGrid";
import { parseSection, sectionParam, sectionTitle, type LibrarySection } from "../features/library/sections";
import { TrashView } from "../features/library/TrashView";
import { colors } from "../theme/colors";

/** Below this window width the sidebar hides behind a toolbar button (Split View, narrow Stage Manager windows). */
const COMPACT_WIDTH = 720;

export default function LibraryScreen() {
  const params = useLocalSearchParams();
  const section = parseSection(params["section"]);
  const { width } = useWindowDimensions();
  const isCompact = width < COMPACT_WIDTH;
  const folders = useLiveRead(["folders"], (repo) => repo.folders.list());
  const folderList = folders.status === "ready" ? folders.value : [];

  const select = (next: LibrarySection) => {
    router.setParams({ section: sectionParam(next) });
  };
  const openNewNotebook = () => {
    router.push(
      section.kind === "folder"
        ? { pathname: "/new-notebook", params: { folderId: section.folderId } }
        : { pathname: "/new-notebook" },
    );
  };

  return (
    <>
      <View style={{ flex: 1, flexDirection: "row", backgroundColor: colors.background }}>
        {!isCompact && <LibrarySidebar section={section} folders={folderList} onSelect={select} />}
        <View style={{ flex: 1 }}>
          {section.kind === "trash" ? (
            <TrashView />
          ) : (
            <NotebookGrid
              section={section}
              folders={folderList}
              width={isCompact ? width : width - SIDEBAR_WIDTH}
              onCreate={openNewNotebook}
            />
          )}
        </View>
      </View>
      <Stack.Screen.Title>{sectionTitle(section, folderList)}</Stack.Screen.Title>
      {isCompact && (
        <Stack.Toolbar placement="left">
          <Stack.Toolbar.Button
            icon="sidebar.left"
            onPress={() => {
              showSectionPicker(folderList, select);
            }}
          />
        </Stack.Toolbar>
      )}
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button icon="plus" onPress={openNewNotebook} />
      </Stack.Toolbar>
    </>
  );
}
