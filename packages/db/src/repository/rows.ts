import { Folder, Notebook, Page, PageSize, PageTemplate } from "@nibnote/shared";
import type { folders, notebooks, pages } from "../schema";

// Rows become domain types exactly once, here. JSON columns are parsed on the same line.

export function toFolder(row: typeof folders.$inferSelect): Folder {
  return Folder.parse({
    id: row.id,
    name: row.name,
    parentId: row.parentId,
    sortKey: row.sortKey,
    role: row.role,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  });
}

export function toNotebook(row: typeof notebooks.$inferSelect): Notebook {
  return Notebook.parse({
    id: row.id,
    folderId: row.folderId,
    title: row.title,
    coverColor: row.coverColor,
    pageSize: PageSize.parse(JSON.parse(row.pageSize)),
    defaultTemplate: PageTemplate.parse(JSON.parse(row.defaultTemplate)),
    isFavourite: row.isFavourite,
    lastOpenedAt: row.lastOpenedAt,
    role: row.role,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  });
}

export function toPage(row: typeof pages.$inferSelect): Page {
  return Page.parse({
    id: row.id,
    notebookId: row.notebookId,
    sortKey: row.sortKey,
    template: PageTemplate.parse(JSON.parse(row.template)),
    widthPt: row.widthPt,
    heightPt: row.heightPt,
    drawingPath: row.drawingPath,
    drawingHash: row.drawingHash,
    thumbnailPath: row.thumbnailPath,
    dailyDate: row.dailyDate,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  });
}
