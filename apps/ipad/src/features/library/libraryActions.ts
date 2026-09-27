import type { Repository, RepositoryError } from "@nibnote/db";
import type { Folder, FolderId, Notebook, Page, Result } from "@nibnote/shared";
import { ActionSheetIOS, Alert, type GestureResponderEvent } from "react-native";
import { deletePurgedFiles } from "../../db/files";
import type { LibrarySection } from "./sections";

// Native iOS menus and prompts for library items. On iPad the action sheet appears as a popover
// anchored to the long-pressed view. Every repository failure is shown to the user, never dropped.

/** The native view tag of the pressed element, used to anchor the popover on iPad. */
export function anchorOf(event: GestureResponderEvent): number | undefined {
  const tag = Number(event.nativeEvent.target);
  return Number.isFinite(tag) ? tag : undefined;
}

function describe(error: RepositoryError): string {
  switch (error.code) {
    case "notFound":
      return `That ${error.entity} no longer exists.`;
    case "folderTooDeep":
      return "Folders can be nested one level deep.";
    case "lastPage":
      return "A notebook needs at least one page.";
  }
}

function report<T>(result: Result<T, RepositoryError>, action: string): void {
  if (!result.ok) Alert.alert(`Couldn't ${action}`, describe(result.error));
}

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

function chooseFolder(repository: Repository, notebook: Notebook, folders: readonly Folder[], anchor?: number) {
  const options = ["No Folder", ...folders.map((folder) => folder.name), "Cancel"];
  ActionSheetIOS.showActionSheetWithOptions(
    { title: "Move to Folder", options, cancelButtonIndex: options.length - 1, anchor },
    (index) => {
      if (index === options.length - 1) return;
      const folderId = index === 0 ? null : (folders[index - 1]?.id ?? null);
      report(repository.notebooks.update(notebook.id, { folderId }), "move the notebook");
    },
  );
}

export function showNotebookActions(
  repository: Repository,
  notebook: Notebook,
  folders: readonly Folder[],
  anchor?: number,
): void {
  const options = [
    "Rename",
    notebook.isFavourite ? "Remove from Favourites" : "Add to Favourites",
    "Move to Folder…",
    "Move to Trash",
    "Cancel",
  ];
  ActionSheetIOS.showActionSheetWithOptions(
    { title: notebook.title, options, cancelButtonIndex: 4, destructiveButtonIndex: 3, anchor },
    (index) => {
      switch (index) {
        case 0:
          promptForName("Rename Notebook", notebook.title, "Save", (title) => {
            report(repository.notebooks.update(notebook.id, { title }), "rename the notebook");
          });
          return;
        case 1:
          report(
            repository.notebooks.update(notebook.id, { isFavourite: !notebook.isFavourite }),
            "update favourites",
          );
          return;
        case 2:
          chooseFolder(repository, notebook, folders, anchor);
          return;
        case 3:
          report(repository.notebooks.trash(notebook.id), "move the notebook to the trash");
          return;
        default:
          return;
      }
    },
  );
}

export function createFolder(repository: Repository, parentId: FolderId | null): void {
  promptForName(parentId === null ? "New Folder" : "New Subfolder", "", "Create", (name) => {
    report(repository.folders.create({ name, parentId }), "create the folder");
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
          report(repository.folders.rename(folder.id, name), "rename the folder");
        });
      } else if (choice === "New Subfolder") {
        createFolder(repository, folder.id);
      } else if (choice === "Move to Trash") {
        report(repository.folders.trash(folder.id), "move the folder to the trash");
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
      report(repository.folders.restore(item.folder.id), "restore the folder");
      return;
    case "notebook":
      report(repository.notebooks.restore(item.notebook.id), "restore the notebook");
      return;
    case "page":
      report(repository.pages.restore(item.page.id), "restore the page");
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
    else report(result, "delete it");
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
