import { createContext, use, useEffect, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { useStore, type StoreApi } from "zustand";
import { useRepository } from "../../db/DatabaseProvider";
import { createToolboxStore, type ToolboxState } from "./toolboxStore";

const ToolboxContext = createContext<StoreApi<ToolboxState> | null>(null);

/** Loads the saved tools once for the whole app, so switching notebooks keeps them. */
export function ToolboxProvider({ children }: { readonly children: ReactNode }) {
  const repository = useRepository();
  const [store] = useState(() => createToolboxStore(repository.toolbox));

  useEffect(() => {
    // Saves are debounced; write the last change before iOS may suspend or end the app.
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") store.getState().actions.flush();
    });
    return () => {
      subscription.remove();
      store.getState().actions.flush();
    };
  }, [store]);

  return <ToolboxContext value={store}>{children}</ToolboxContext>;
}

/** Subscribes to one part of the tool state; the component re-renders only when that part changes. */
export function useToolbox<T>(selector: (state: ToolboxState) => T): T {
  const store = use(ToolboxContext);
  if (store === null) throw new Error("useToolbox must be used inside <ToolboxProvider>");
  return useStore(store, selector);
}
