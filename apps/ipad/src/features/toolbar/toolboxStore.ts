import {
  addRecentColor,
  afterPencilAction,
  chooseColor,
  selectEraserPreset,
  selectSlot,
  selectWidthPreset,
  setDock,
  setEraserMode,
  setEraserPreset,
  setPenInk,
  setPinnedColor,
  setWidthPreset,
  toggleDrawingPolicy,
  toggleHighlighterOnly,
  type ColorSlot,
  type EraserMode,
  type HexColor,
  type PenInk,
  type PencilPreferredAction,
  type Toolbox,
  type ToolbarDock,
  type ToolSlot,
  type TrioIndex,
} from "@nibnote/shared";
import { createStore, type StoreApi } from "zustand";

// The editor's tools, shared by the toolbar, its popovers and the canvas. The rules live in
// @nibnote/shared as pure functions; this store holds the current toolbox and saves it.

export type ToolboxStorage = {
  readonly load: () => Toolbox;
  readonly save: (toolbox: Toolbox) => void;
};

export type ToolboxActions = {
  readonly selectSlot: (slot: ToolSlot) => void;
  readonly chooseColor: (slot: ColorSlot, color: HexColor) => void;
  readonly setPinnedColor: (slot: ColorSlot, index: TrioIndex, color: HexColor) => void;
  readonly addRecentColor: (color: HexColor) => void;
  readonly selectWidthPreset: (slot: ColorSlot, index: TrioIndex) => void;
  readonly setWidthPreset: (slot: ColorSlot, index: TrioIndex, width: number) => void;
  readonly setPenInk: (ink: PenInk) => void;
  readonly applyPencilAction: (action: PencilPreferredAction) => void;
  readonly toggleDrawingPolicy: () => void;
  readonly setDock: (dock: ToolbarDock) => void;
  readonly setEraserMode: (mode: EraserMode) => void;
  readonly toggleHighlighterOnly: () => void;
  readonly selectEraserPreset: (index: TrioIndex) => void;
  readonly setEraserPreset: (index: TrioIndex, width: number) => void;
  /** Writes a pending change now (the app is going to the background). */
  readonly flush: () => void;
};

export type ToolboxState = {
  readonly toolbox: Toolbox;
  /** Created once, so selecting it never re-renders a component. */
  readonly actions: ToolboxActions;
};

/**
 * Saves are debounced: the system colour picker reports a colour many times a second while the
 * user drags, and only where they stop needs to reach the database.
 */
const SAVE_DELAY_MS = 300;

export function createToolboxStore(storage: ToolboxStorage): StoreApi<ToolboxState> {
  return createStore<ToolboxState>()((set, get) => {
    const pending: { timer: ReturnType<typeof setTimeout> | null } = { timer: null };

    const save = () => {
      pending.timer = null;
      try {
        storage.save(get().toolbox);
      } catch (error) {
        // The tools keep working for this session; only remembering them failed.
        console.error("Saving the tools failed", error instanceof Error ? error.message : String(error));
      }
    };

    const commit = (next: Toolbox) => {
      // The rules return the same object when nothing changed: no save, no re-render.
      if (next === get().toolbox) return;
      set({ toolbox: next });
      if (pending.timer !== null) clearTimeout(pending.timer);
      pending.timer = setTimeout(save, SAVE_DELAY_MS);
    };

    const update = (rule: (toolbox: Toolbox) => Toolbox) => {
      commit(rule(get().toolbox));
    };

    return {
      toolbox: storage.load(),
      actions: {
        selectSlot: (slot) => {
          update((toolbox) => selectSlot(toolbox, slot));
        },
        chooseColor: (slot, color) => {
          update((toolbox) => chooseColor(toolbox, slot, color));
        },
        setPinnedColor: (slot, index, color) => {
          update((toolbox) => setPinnedColor(toolbox, slot, index, color));
        },
        addRecentColor: (color) => {
          update((toolbox) => addRecentColor(toolbox, color));
        },
        selectWidthPreset: (slot, index) => {
          update((toolbox) => selectWidthPreset(toolbox, slot, index));
        },
        setWidthPreset: (slot, index, width) => {
          update((toolbox) => setWidthPreset(toolbox, slot, index, width));
        },
        setPenInk: (ink) => {
          update((toolbox) => setPenInk(toolbox, ink));
        },
        applyPencilAction: (action) => {
          update((toolbox) => afterPencilAction(toolbox, action));
        },
        toggleDrawingPolicy: () => {
          update(toggleDrawingPolicy);
        },
        setDock: (dock) => {
          update((toolbox) => setDock(toolbox, dock));
        },
        setEraserMode: (mode) => {
          update((toolbox) => setEraserMode(toolbox, mode));
        },
        toggleHighlighterOnly: () => {
          update(toggleHighlighterOnly);
        },
        selectEraserPreset: (index) => {
          update((toolbox) => selectEraserPreset(toolbox, index));
        },
        setEraserPreset: (index, width) => {
          update((toolbox) => setEraserPreset(toolbox, index, width));
        },
        flush: () => {
          if (pending.timer === null) return;
          clearTimeout(pending.timer);
          save();
        },
      },
    };
  });
}
