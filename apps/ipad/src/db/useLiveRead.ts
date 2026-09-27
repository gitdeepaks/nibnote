import type { Repository } from "@nibnote/db";
import { addDatabaseChangeListener } from "expo-sqlite";
import { useEffect, useEffectEvent, useState } from "react";
import { useRepository } from "./DatabaseProvider";

/** Tables whose changes can refresh a live read (SQLite table names). */
export type LiveTable = "folders" | "notebooks" | "pages" | "tags" | "page_tags" | "page_links" | "settings";

export type LiveRead<T> =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly value: T }
  | { readonly status: "error"; readonly message: string };

/**
 * Runs `read` against the repository and re-runs it whenever one of `tables` changes, or when
 * `readKey` changes (pass whatever the read depends on, e.g. the selected section). A burst of row
 * changes (one transaction touches several rows) is coalesced into a single re-read on the next
 * frame, so a write never triggers more than one render per screen.
 */
export function useLiveRead<T>(
  tables: readonly LiveTable[],
  read: (repository: Repository) => T,
  readKey = "",
): LiveRead<T> {
  const repository = useRepository();
  const [state, setState] = useState<LiveRead<T>>({ status: "loading" });
  const tableKey = [...tables].sort().join(",");

  const refresh = useEffectEvent(() => {
    try {
      setState({ status: "ready", value: read(repository) });
    } catch (error) {
      setState({ status: "error", message: error instanceof Error ? error.message : "Could not read the library" });
    }
  });

  useEffect(() => {
    const watched = new Set(tableKey.split(","));
    const pending: { frame: number | null } = { frame: null };
    refresh();
    const subscription = addDatabaseChangeListener((event) => {
      if (!watched.has(event.tableName) || pending.frame !== null) return;
      pending.frame = requestAnimationFrame(() => {
        pending.frame = null;
        refresh();
      });
    });
    return () => {
      subscription.remove();
      if (pending.frame !== null) cancelAnimationFrame(pending.frame);
    };
  }, [tableKey, readKey]);

  return state;
}
