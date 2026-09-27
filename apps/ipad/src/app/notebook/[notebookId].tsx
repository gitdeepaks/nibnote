import { NotebookId } from "@nibnote/shared";
import { useLocalSearchParams } from "expo-router";
import { Editor, NotebookNotFound } from "../../features/editor/Editor";

/** `/notebook/<id>`, also reached by the `nibnote://notebook/<id>` deep link. */
export default function NotebookRoute() {
  const params = useLocalSearchParams();
  const notebookId = NotebookId.safeParse(params["notebookId"]);
  if (!notebookId.success) return <NotebookNotFound />;
  // A new notebook starts a fresh editor (page selection, tools, undo state).
  return <Editor key={notebookId.data} notebookId={notebookId.data} />;
}
