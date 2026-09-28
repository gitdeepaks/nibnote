import { NotebookId, type Notebook } from "@nibnote/shared";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { notebooks } from "../schema";
import { toNotebook } from "./rows";
import { createSettingsQueries } from "./settings";
import type { Db } from "./types";

// The editor's notebook tabs. Device-local (settings, no outbox) and kept across restarts. A
// trashed or deleted notebook drops out of the tabs the next time they are read or written.

export const MAX_TABS = 8;
const TABS_KEY = "openTabs";
const TabIds = z.array(NotebookId).max(MAX_TABS * 2);

export function createTabQueries<R>(db: Db<R>) {
  const preferences = createSettingsQueries(db);

  const liveNotebook = (id: NotebookId) => {
    const row = db
      .select()
      .from(notebooks)
      .where(and(eq(notebooks.id, id), isNull(notebooks.deletedAt)))
      .get();
    return row === undefined ? undefined : toNotebook(row);
  };

  const live = (): Notebook[] =>
    preferences.get(TABS_KEY, TabIds, []).flatMap((id) => {
      const notebook = liveNotebook(id);
      return notebook === undefined ? [] : [notebook];
    });

  const save = (tabs: readonly Notebook[]) => {
    preferences.set(
      TABS_KEY,
      TabIds,
      tabs.map((tab) => tab.id),
    );
  };

  return {
    /** Open tabs, left to right. */
    list(): Notebook[] {
      return live();
    },

    /**
     * Adds a notebook's tab on the right, or keeps its place if it is already open. Past the limit,
     * the tab opened longest ago closes (never the one being opened).
     */
    open(id: NotebookId): void {
      const tabs = live();
      if (tabs.some((tab) => tab.id === id)) return;
      const notebook = liveNotebook(id);
      if (notebook === undefined) return;
      const next = [...tabs, notebook];
      while (next.length > MAX_TABS) {
        const oldest = next
          .slice(0, -1)
          .reduce((a, b) => ((a.lastOpenedAt ?? 0) <= (b.lastOpenedAt ?? 0) ? a : b));
        next.splice(next.indexOf(oldest), 1);
      }
      save(next);
    },

    /** Closes a tab and returns the tab to show instead: its right neighbour, else its left one. */
    close(id: NotebookId): NotebookId | null {
      const tabs = live();
      const index = tabs.findIndex((tab) => tab.id === id);
      if (index < 0) return null;
      const next = tabs.filter((tab) => tab.id !== id);
      save(next);
      return (next[index] ?? next[index - 1])?.id ?? null;
    },
  };
}
