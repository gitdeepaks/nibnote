import { NotebookId, PageId } from "@nibnote/shared";
import { useLocalSearchParams, usePreventZoomTransitionDismissal } from "expo-router";
import { View } from "react-native";
import { Editor, NotebookNotFound } from "../../features/editor/Editor";
import { NotebookTabs } from "../../features/editor/NotebookTabs";

/**
 * `/notebook/<id>`, also reached by the `nibnote://notebook/<id>` deep link. An optional `page`
 * param opens a given page (the Daily note uses it). Switching tabs changes the params in place.
 */
/** Width of the left-edge strip where the back swipe may start. */
const BACK_SWIPE_EDGE = 24;

export default function NotebookRoute() {
  // Notebooks open with the zoom transition, which lets a drag down anywhere close the screen; it
  // closed the notebook while dragging the toolbar's grip. Only the left-edge back swipe may close it.
  usePreventZoomTransitionDismissal({ unstable_dismissalBoundsRect: { maxX: BACK_SWIPE_EDGE } });
  const params = useLocalSearchParams();
  const notebookId = NotebookId.safeParse(params["notebookId"]);
  const page = PageId.safeParse(params["page"]);
  if (!notebookId.success) return <NotebookNotFound />;
  return (
    <View style={{ flex: 1 }}>
      <NotebookTabs currentId={notebookId.data} />
      {/* A new notebook starts a fresh editor (page selection, tools, undo state). */}
      <Editor key={notebookId.data} notebookId={notebookId.data} initialPageId={page.success ? page.data : null} />
    </View>
  );
}
