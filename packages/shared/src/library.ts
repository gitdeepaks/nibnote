import { z } from "zod";
import { HexColor, PageSize, PageTemplate } from "./canvas";
import { FolderId, NotebookId, PageId } from "./ids";

// Domain types for the local library. Rows from the database are parsed into these once,
// so the rest of the app only ever sees branded IDs and validated values.

/** Milliseconds since the Unix epoch. */
export const EpochMs = z.number().int().nonnegative();
export type EpochMs = z.infer<typeof EpochMs>;

export const TITLE_MAX_LENGTH = 200;
export const DEFAULT_NOTEBOOK_TITLE = "Untitled notebook";
export const DEFAULT_FOLDER_NAME = "New folder";

/** Trims a user-entered name; empty input becomes the fallback, long input is cut at a character boundary. */
export function normaliseTitle(input: string, fallback: string): string {
  const trimmed = input.trim();
  if (trimmed.length === 0) return fallback;
  const characters = Array.from(trimmed);
  return characters.length > TITLE_MAX_LENGTH ? characters.slice(0, TITLE_MAX_LENGTH).join("") : trimmed;
}

/** A path relative to the app's Documents or Caches directory, never an absolute container path. */
export const RelativePath = z
  .string()
  .min(1)
  .refine((path) => !path.startsWith("/") && !path.includes("..") && !path.includes("://"), {
    message: "must be a relative path inside the app container",
  })
  .brand<"RelativePath">();
export type RelativePath = z.infer<typeof RelativePath>;

const Lifecycle = {
  createdAt: EpochMs,
  updatedAt: EpochMs,
  deletedAt: EpochMs.nullable(),
};

/** Names the app gives its system notebook and folder; users can rename them. */
export const DAILY_NOTEBOOK_TITLE = "Daily";
export const INBOX_FOLDER_NAME = "Inbox";

/** A system folder the app manages (still renamable and trashable like any folder). */
export const FolderRole = z.enum(["inbox"]);
export type FolderRole = z.infer<typeof FolderRole>;

/** A system notebook the app manages. */
export const NotebookRole = z.enum(["daily"]);
export type NotebookRole = z.infer<typeof NotebookRole>;

/**
 * A calendar day on the device's own calendar, as `YYYY-MM-DD`. Stored as text, so a page keeps
 * its day when the timezone changes; "today" is recomputed from the device clock every time.
 */
export const LocalDate = z.iso.date().brand<"LocalDate">();
export type LocalDate = z.infer<typeof LocalDate>;

/** The local calendar day of `date` (never the UTC day). */
export function localDateOf(date: Date): LocalDate {
  const pad = (value: number) => String(value).padStart(2, "0");
  return LocalDate.parse(`${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`);
}

export const Folder = z
  .object({
    id: FolderId,
    name: z
      .string()
      .min(1)
      .max(TITLE_MAX_LENGTH * 4),
    parentId: FolderId.nullable(),
    sortKey: z.string().min(1),
    role: FolderRole.nullable(),
    ...Lifecycle,
  })
  .readonly();
export type Folder = z.infer<typeof Folder>;

export const Notebook = z
  .object({
    id: NotebookId,
    folderId: FolderId.nullable(),
    title: z
      .string()
      .min(1)
      .max(TITLE_MAX_LENGTH * 4),
    coverColor: HexColor,
    pageSize: PageSize,
    defaultTemplate: PageTemplate,
    isFavourite: z.boolean(),
    lastOpenedAt: EpochMs.nullable(),
    role: NotebookRole.nullable(),
    ...Lifecycle,
  })
  .readonly();
export type Notebook = z.infer<typeof Notebook>;

export const Page = z
  .object({
    id: PageId,
    notebookId: NotebookId,
    sortKey: z.string().min(1),
    template: PageTemplate,
    widthPt: z.number().positive(),
    heightPt: z.number().positive(),
    drawingPath: RelativePath,
    drawingHash: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .nullable(),
    thumbnailPath: RelativePath.nullable(),
    /** The day this page belongs to in the Daily notebook; null for every other page. */
    dailyDate: LocalDate.nullable(),
    ...Lifecycle,
  })
  .readonly();
export type Page = z.infer<typeof Page>;
