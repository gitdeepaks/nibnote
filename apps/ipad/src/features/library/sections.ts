import type { NotebookFilter } from "@nibnote/db";
import { FolderId, type Folder } from "@nibnote/shared";
import { z } from "zod";

/** What the library shows. Kept in the `section` search param so it survives restarts and deep links. */
export type LibrarySection =
  | { readonly kind: "all" }
  | { readonly kind: "favourites" }
  | { readonly kind: "recents" }
  | { readonly kind: "trash" }
  | { readonly kind: "folder"; readonly folderId: FolderId };

const FixedSection = z.enum(["all", "favourites", "recents", "trash"]);
const FOLDER_PREFIX = "folder:";
export const RECENTS_LIMIT = 30;

/** Parses the route param; anything unrecognised shows All rather than an error. */
export function parseSection(param: string | string[] | null): LibrarySection {
  const value = typeof param === "string" ? param : "";
  const fixed = FixedSection.safeParse(value);
  if (fixed.success) return { kind: fixed.data };
  if (value.startsWith(FOLDER_PREFIX)) {
    const folderId = FolderId.safeParse(value.slice(FOLDER_PREFIX.length));
    if (folderId.success) return { kind: "folder", folderId: folderId.data };
  }
  return { kind: "all" };
}

export function sectionParam(section: LibrarySection): string {
  return section.kind === "folder" ? `${FOLDER_PREFIX}${section.folderId}` : section.kind;
}

export function sectionTitle(section: LibrarySection, folders: readonly Folder[]): string {
  switch (section.kind) {
    case "all":
      return "All Notebooks";
    case "favourites":
      return "Favourites";
    case "recents":
      return "Recents";
    case "trash":
      return "Trash";
    case "folder":
      return folders.find((folder) => folder.id === section.folderId)?.name ?? "Folder";
  }
}

/** The notebook query for a section; Trash has its own view. */
export function notebookFilter(section: Exclude<LibrarySection, { kind: "trash" }>): NotebookFilter {
  switch (section.kind) {
    case "all":
      return { kind: "all" };
    case "favourites":
      return { kind: "favourites" };
    case "recents":
      return { kind: "recents", limit: RECENTS_LIMIT };
    case "folder":
      return { kind: "folder", folderId: section.folderId };
  }
}
