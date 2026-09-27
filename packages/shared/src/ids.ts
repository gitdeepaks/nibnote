import { z } from "zod";

// Branded IDs: a PageId can never be passed where a NotebookId is expected
export const PageId = z.uuid().brand<"PageId">();
export type PageId = z.infer<typeof PageId>;

export const NotebookId = z.uuid().brand<"NotebookId">();
export type NotebookId = z.infer<typeof NotebookId>;

export const FolderId = z.uuid().brand<"FolderId">();
export type FolderId = z.infer<typeof FolderId>;

export const TagId = z.uuid().brand<"TagId">();
export type TagId = z.infer<typeof TagId>;
