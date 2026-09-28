import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// Local schema from the build plan (Phase 2). Timestamps are epoch milliseconds. File paths are
// relative to Documents (drawings) or Caches (thumbnails) because the app container path can
// change between installs. JSON columns hold text that is always parsed with a Zod schema.

/** Columns every syncable table carries for trash, sync versions and the outbox. */
const syncable = {
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
  /** Set when the row is in the trash; null when live. */
  deletedAt: integer("deleted_at"),
  /** Last version acknowledged by the server; 0 until the first sync (Phase 5). */
  serverVersion: integer("server_version").notNull().default(0),
  /** True while the row has local changes the server hasn't seen. */
  isDirty: integer("is_dirty", { mode: "boolean" }).notNull().default(true),
};

export const folders = sqliteTable(
  "folders",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    /** One level of nesting in v1.0. */
    parentId: text("parent_id"),
    sortKey: text("sort_key").notNull(),
    /**
     * A system folder the app manages ("inbox"); null for the user's own folders. Not unique:
     * two devices may each create one before syncing, and Phase 5 merges them.
     */
    role: text("role", { enum: ["inbox"] }),
    ...syncable,
  },
  (table) => [
    index("folders_parent_sort_idx").on(table.parentId, table.sortKey),
  ],
);

export const notebooks = sqliteTable(
  "notebooks",
  {
    id: text("id").primaryKey(),
    folderId: text("folder_id").references(() => folders.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    coverColor: text("cover_color").notNull(),
    /** JSON `PageSize`. */
    pageSize: text("page_size").notNull(),
    /** JSON `PageTemplate`. */
    defaultTemplate: text("default_template").notNull(),
    isFavourite: integer("is_favourite", { mode: "boolean" })
      .notNull()
      .default(false),
    lastOpenedAt: integer("last_opened_at"),
    /** A system notebook the app manages ("daily"); null otherwise. Not unique, like folder roles. */
    role: text("role", { enum: ["daily"] }),
    ...syncable,
  },
  (table) => [
    index("notebooks_folder_idx").on(table.folderId),
    index("notebooks_last_opened_idx").on(table.lastOpenedAt),
  ],
);

export const pages = sqliteTable(
  "pages",
  {
    id: text("id").primaryKey(),
    notebookId: text("notebook_id")
      .notNull()
      .references(() => notebooks.id, { onDelete: "cascade" }),
    sortKey: text("sort_key").notNull(),
    /** JSON `PageTemplate`. */
    template: text("template").notNull(),
    /** Per-page size: paper pages copy the notebook size; PDF pages (Phase 6) differ. */
    widthPt: real("width_pt").notNull(),
    heightPt: real("height_pt").notNull(),
    /** Relative to Documents. */
    drawingPath: text("drawing_path").notNull(),
    drawingHash: text("drawing_hash"),
    /** Relative to Caches; safe to regenerate. */
    thumbnailPath: text("thumbnail_path"),
    /** Filled in Phase 7. */
    recognizedText: text("recognized_text"),
    /** `YYYY-MM-DD` on the device's calendar, for pages in the Daily notebook. */
    dailyDate: text("daily_date"),
    ...syncable,
  },
  (table) => [
    index("pages_notebook_sort_idx").on(table.notebookId, table.sortKey),
    index("pages_notebook_daily_idx").on(table.notebookId, table.dailyDate),
  ],
);

/** Written in the same transaction as every change; drained by the sync engine in Phase 5. */
export const syncOutbox = sqliteTable(
  "sync_outbox",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    entity: text("entity", {
      enum: ["folder", "notebook", "page", "tag"],
    }).notNull(),
    entityId: text("entity_id").notNull(),
    op: text("op", { enum: ["upsert", "delete"] }).notNull(),
    createdAt: integer("created_at").notNull(),
    attempts: integer("attempts").notNull().default(0),
  },
  (table) => [index("sync_outbox_created_idx").on(table.createdAt)],
);

export const tags = sqliteTable(
  "tags",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    colorHex: text("color_hex").notNull(),
    ...syncable,
  },
  (table) => [uniqueIndex("tags_name_unique").on(sql`lower(${table.name})`)],
);

export const pageTags = sqliteTable(
  "page_tags",
  {
    pageId: text("page_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.pageId, table.tagId] }),
    index("page_tags_tag_idx").on(table.tagId),
  ],
);

export const pageLinks = sqliteTable(
  "page_links",
  {
    id: text("id").primaryKey(),
    sourcePageId: text("source_page_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    targetPageId: text("target_page_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    /** JSON `{ x, y, width, height }` in page points. */
    rect: text("rect").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [index("page_links_target_idx").on(table.targetPageId)],
);

/** Device-local preferences; every value is parsed with its own Zod schema, falling back to a default. */
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  valueJson: text("value_json").notNull(),
});
