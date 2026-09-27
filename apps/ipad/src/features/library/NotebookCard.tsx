import type { Folder, Notebook } from "@nibnote/shared";
import { Link } from "expo-router";
import { SymbolView } from "expo-symbols";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useRepository } from "../../db/DatabaseProvider";
import { thumbnailFile } from "../../db/files";
import { colors } from "../../theme/colors";
import { moveNotebook, renameNotebook, toggleFavourite, trashNotebook } from "./libraryActions";
import { relativeTime } from "./relativeTime";

const COVER_HEIGHT = 180;
const PREVIEW_WIDTH = 360;
/** Pages are always white paper in v1.0 (the canvas renders in light appearance). */
const PAPER = "#FFFFFF";

type NotebookCardProps = {
  readonly notebook: Notebook;
  readonly pageCount: number;
  readonly now: number;
  readonly folders: readonly Folder[];
};

/**
 * A cover shaped like the notebook's pages, with the title and details underneath. Tapping opens
 * the editor with a zoom; long-pressing shows the page the notebook opens on and its actions.
 */
export function NotebookCard({ notebook, pageCount, now, folders }: NotebookCardProps) {
  const repository = useRepository();
  const ratio = notebook.pageSize.widthPt / notebook.pageSize.heightPt;
  const aspectRatio = Math.min(Math.max(ratio, 0.6), 1.5);
  const pages = `${String(pageCount)} ${pageCount === 1 ? "page" : "pages"}`;
  return (
    <Link href={{ pathname: "/notebook/[notebookId]", params: { notebookId: notebook.id } }} asChild>
      <Link.Trigger>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${notebook.title}, ${pages}`}
          accessibilityHint="Opens the notebook. Long press for options."
          style={{ gap: 8, padding: 8 }}
        >
          <View style={{ height: COVER_HEIGHT, alignItems: "center", justifyContent: "flex-end" }}>
            <Link.AppleZoom>
              {/* The zoom needs one real native view, so React Native must not flatten this one. */}
              <View
                collapsable={false}
                style={{
                  height: aspectRatio > 1 ? COVER_HEIGHT / aspectRatio : COVER_HEIGHT,
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
            </Link.AppleZoom>
          </View>
          <Text numberOfLines={2} style={{ fontSize: 15, fontWeight: "600", textAlign: "center", color: colors.label }}>
            {notebook.title}
          </Text>
          <Text numberOfLines={1} style={{ fontSize: 12, textAlign: "center", color: colors.secondaryLabel }}>
            {`${pages} · ${relativeTime(notebook.updatedAt, now)}`}
          </Text>
        </Pressable>
      </Link.Trigger>
      <Link.Preview style={{ width: PREVIEW_WIDTH, height: PREVIEW_WIDTH / ratio }}>
        <NotebookPreview notebook={notebook} />
      </Link.Preview>
      <Link.Menu>
        <Link.MenuAction
          icon="pencil"
          onPress={() => {
            renameNotebook(repository, notebook);
          }}
        >
          Rename
        </Link.MenuAction>
        <Link.MenuAction
          icon={notebook.isFavourite ? "star.slash" : "star"}
          onPress={() => {
            toggleFavourite(repository, notebook);
          }}
        >
          {notebook.isFavourite ? "Remove from Favourites" : "Add to Favourites"}
        </Link.MenuAction>
        <Link.Menu title="Move to Folder" icon="folder">
          <Link.MenuAction
            isOn={notebook.folderId === null}
            onPress={() => {
              moveNotebook(repository, notebook, null);
            }}
          >
            No Folder
          </Link.MenuAction>
          {folders.map((folder) => (
            <Link.MenuAction
              key={folder.id}
              isOn={notebook.folderId === folder.id}
              onPress={() => {
                moveNotebook(repository, notebook, folder.id);
              }}
            >
              {folder.name}
            </Link.MenuAction>
          ))}
        </Link.Menu>
        <Link.MenuAction
          icon="trash"
          destructive
          onPress={() => {
            trashNotebook(repository, notebook);
          }}
        >
          Move to Trash
        </Link.MenuAction>
      </Link.Menu>
    </Link>
  );
}

/**
 * The page the notebook will open on, from its thumbnail. Rendered only while the preview is
 * visible, so the grid never reads per card. A page that was never saved has no thumbnail yet.
 */
function NotebookPreview({ notebook }: { readonly notebook: Notebook }) {
  const repository = useRepository();
  const page = repository.pages.openingPage(notebook.id);
  const thumbnail = page === undefined ? null : thumbnailFile(page.id);
  return (
    <View style={{ flex: 1, backgroundColor: PAPER }}>
      {thumbnail?.exists === true && (
        // The file is rewritten in place after each save, so skip the image cache.
        <Image source={{ uri: thumbnail.uri, cache: "reload" }} resizeMode="contain" style={{ flex: 1 }} />
      )}
    </View>
  );
}
