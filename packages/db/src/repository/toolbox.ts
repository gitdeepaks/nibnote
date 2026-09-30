import { DEFAULT_TOOLBOX, StoredToolbox, type Toolbox } from "@nibnote/shared";
import { createSettingsQueries } from "./settings";
import type { Db } from "./types";

// The editor's tools and their settings. Device-local (settings, no outbox): a pen colour is a
// preference of this iPad, not part of any note. Reading never fails (see StoredToolbox).

const TOOLBOX_KEY = "toolbox";

export function createToolboxQueries<R>(db: Db<R>) {
  const preferences = createSettingsQueries(db);
  return {
    load(): Toolbox {
      return preferences.get(TOOLBOX_KEY, StoredToolbox, DEFAULT_TOOLBOX);
    },

    save(toolbox: Toolbox): void {
      preferences.set(TOOLBOX_KEY, StoredToolbox, toolbox);
    },
  };
}
