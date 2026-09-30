import {
  afterPencilAction,
  chooseColor,
  selectSlot,
  toggleDrawingPolicy,
  type ColorSlot,
  type HexColor,
  type PencilPreferredAction,
  type Toolbox,
  type ToolSlot,
} from "@nibnote/shared";
import { createStore, type StoreApi } from "zustand";

// The editor's tools, shared by the toolbar and the canvas. The rules live in @nibnote/shared as
// pure functions; this store only holds the current toolbox and saves every change.

export type ToolboxStorage = {
  readonly load: () => Toolbox;
  readonly save: (toolbox: Toolbox) => void;
};

export type ToolboxState = {
  readonly toolbox: Toolbox;
  readonly selectSlot: (slot: ToolSlot) => void;
  readonly chooseColor: (slot: ColorSlot, color: HexColor) => void;
  readonly applyPencilAction: (action: PencilPreferredAction) => void;
  readonly toggleDrawingPolicy: () => void;
};

export function createToolboxStore(storage: ToolboxStorage): StoreApi<ToolboxState> {
  return createStore<ToolboxState>()((set, get) => {
    const commit = (next: Toolbox) => {
      // The rules return the same object when nothing changed: no save, no re-render.
      if (next === get().toolbox) return;
      set({ toolbox: next });
      try {
        storage.save(next);
      } catch (error) {
        // The tools keep working for this session; only remembering them failed.
        console.error("Saving the tools failed", error instanceof Error ? error.message : String(error));
      }
    };
    return {
      toolbox: storage.load(),
      selectSlot: (slot) => {
        commit(selectSlot(get().toolbox, slot));
      },
      chooseColor: (slot, color) => {
        commit(chooseColor(get().toolbox, slot, color));
      },
      applyPencilAction: (action) => {
        commit(afterPencilAction(get().toolbox, action));
      },
      toggleDrawingPolicy: () => {
        commit(toggleDrawingPolicy(get().toolbox));
      },
    };
  });
}
