import type { Repository } from "@nibnote/db";
import type { Folder, FolderId, Notebook, Page } from "@nibnote/shared";
import { ActionSheetIOS, Alert } from "react-native";
import { deletePurgedFiles } from "../../db/files";
import { reportFailure } from "../../db/reportFailure";
import type { LibrarySection } from "./sections";

// Library actions and the native prompts they need. Notebook cards offer these through Link.Menu;
// folder rows use an action sheet, which on iPad is a popover anchored to the long-pressed view.
// Every repository failure is shown to the user, never dropped.

function promptForName(title: string, initial: string, confirm: string, onSubmit: (name: string) => void): void {
  Alert.prompt(
    title,
    undefined,
    [
      { text: "Cancel", style: "cancel" },
      {
        text: confirm,
        onPress: (value) => {
          onSubmit(value ?? "");
        },
      },
    ],
    "plain-text",
    initial,
  );
}

export function renameNotebook(repository: Repository, notebook: Notebook): void {
  promptForName("Rename Notebook", notebook.title, "Save", (title) => {
    reportFailure(repository.notebooks.update(notebook.id, { title }), "rename the notebook");
  });
}

export function toggleFavourite(repository: Repository, notebook: Notebook): void {
  reportFailure(repository.notebooks.update(notebook.id, { isFavourite: !notebook.isFavourite }), "update favourites");
}

export function moveNotebook(repository: Repository, notebook: Notebook, folderId: FolderId | null): void {
  if (folderId === notebook.folderId) return;
  reportFailure(repository.notebooks.update(notebook.id, { folderId }), "move the notebook");
}

export function trashNotebook(repository: Repository, notebook: Notebook): void {
  reportFailure(repository.notebooks.trash(notebook.id), "move the notebook to the trash");
}

export function createFolder(repository: Repository, parentId: FolderId | null): void {
  promptForName(parentId === null ? "New Folder" : "New Subfolder", "", "Create", (name) => {
    reportFailure(repository.folders.create({ name, parentId }), "create the folder");
  });
}

export function showFolderActions(repository: Repository, folder: Folder, anchor?: number): void {
  const canNest = folder.parentId === null;
  const options = ["Rename", ...(canNest ? ["New Subfolder"] : []), "Move to Trash", "Cancel"];
  const trashIndex = options.indexOf("Move to Trash");
  ActionSheetIOS.showActionSheetWithOptions(
    {
      title: folder.name,
      message: "Moving a folder to the trash also moves its subfolders and notebooks.",
      options,
      cancelButtonIndex: options.length - 1,
      destructiveButtonIndex: trashIndex,
      anchor,
    },
    (index) => {
      const choice = options[index];
      if (choice === "Rename") {
        promptForName("Rename Folder", folder.name, "Save", (name) => {
          reportFailure(repository.folders.rename(folder.id, name), "rename the folder");
        });
      } else if (choice === "New Subfolder") {
        createFolder(repository, folder.id);
      } else if (choice === "Move to Trash") {
        reportFailure(repository.folders.trash(folder.id), "move the folder to the trash");
      }
    },
  );
}

/** Destructive confirmation for "Delete Forever"; runs `onConfirm` only after the user agrees. */
export function confirmDeleteForever(name: string, onConfirm: () => void): void {
  Alert.alert(`Delete “${name}” forever?`, "This can't be undone.", [
    { text: "Cancel", style: "cancel" },
    { text: "Delete Forever", style: "destructive", onPress: onConfirm },
  ]);
}

/** Something in the trash. Pages carry their notebook's title for display. */
export type TrashItem =
  | { readonly kind: "folder"; readonly folder: Folder }
  | { readonly kind: "notebook"; readonly notebook: Notebook }
  | { readonly kind: "page"; readonly page: Page; readonly notebookTitle: string };

export function trashItemName(item: TrashItem): string {
  switch (item.kind) {
    case "folder":
      return item.folder.name;
    case "notebook":
      return item.notebook.title;
    case "page":
      return `Page from ${item.notebookTitle}`;
  }
}

export function restoreItem(repository: Repository, item: TrashItem): void {
  switch (item.kind) {
    case "folder":
      reportFailure(repository.folders.restore(item.folder.id), "restore the folder");
      return;
    case "notebook":
      reportFailure(repository.notebooks.restore(item.notebook.id), "restore the notebook");
      return;
    case "page":
      reportFailure(repository.pages.restore(item.page.id), "restore the page");
      return;
  }
}

/** Asks first, then deletes the rows and their drawing and thumbnail files. */
export function deleteItemForever(repository: Repository, item: TrashItem): void {
  confirmDeleteForever(trashItemName(item), () => {
    const result =
      item.kind === "folder"
        ? repository.trash.deleteFolderForever(item.folder.id)
        : item.kind === "notebook"
          ? repository.trash.deleteNotebookForever(item.notebook.id)
          : repository.trash.deletePageForever(item.page.id);
    if (result.ok) deletePurgedFiles(result.value);
    else reportFailure(result, "delete it");
  });
}

/** Section chooser for narrow windows, where the sidebar is hidden. */
export function showSectionPicker(
  folders: readonly Folder[],
  onSelect: (section: LibrarySection) => void,
): void {
  const fixed: { readonly label: string; readonly section: LibrarySection }[] = [
    { label: "All Notebooks", section: { kind: "all" } },
    { label: "Favourites", section: { kind: "favourites" } },
    { label: "Recents", section: { kind: "recents" } },
  ];
  const choices = [
    ...fixed,
    ...folders.map((folder) => ({ label: folder.name, section: { kind: "folder" as const, folderId: folder.id } })),
    { label: "Trash", section: { kind: "trash" as const } },
  ];
  const options = [...choices.map((choice) => choice.label), "Cancel"];
  ActionSheetIOS.showActionSheetWithOptions({ title: "Library", options, cancelButtonIndex: choices.length }, (index) => {
    const choice = choices[index];
    if (choice !== undefined) onSelect(choice.section);
  });
}
