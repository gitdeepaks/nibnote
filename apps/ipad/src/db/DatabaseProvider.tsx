import type { Repository } from "@nibnote/db";
import type { ExpoSQLiteDatabase } from "drizzle-orm/expo-sqlite";
import { createContext, use, useEffect, useState, type ReactNode } from "react";
import { RecoveryScreen } from "../features/database/RecoveryScreen";
import { bootDatabase, type DatabaseBoot } from "./boot";

type DatabaseContextValue = { readonly db: ExpoSQLiteDatabase; readonly repository: Repository };

const DatabaseContext = createContext<DatabaseContextValue | null>(null);

/** Boots the local database once, then renders the app; a failed migration shows the recovery screen. */
export function DatabaseProvider({ children }: { readonly children: ReactNode }) {
  const [boot, setBoot] = useState<DatabaseBoot | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    // An object, not a `let`: TypeScript can't see the cleanup below mutating a local boolean.
    const run = { cancelled: false };
    void (async () => {
      try {
        const result = await bootDatabase();
        if (!run.cancelled) setBoot(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : "The database could not be opened";
        if (!run.cancelled) setBoot({ kind: "failed", message, restoredBackup: false });
      }
    })();
    return () => {
      run.cancelled = true;
    };
  }, [attempt]);

  if (boot === null) return null;
  if (boot.kind === "failed") {
    return (
      <RecoveryScreen
        message={boot.message}
        restoredBackup={boot.restoredBackup}
        onRetry={() => {
          setBoot(null);
          setAttempt((count) => count + 1);
        }}
      />
    );
  }
  return <DatabaseContext value={{ db: boot.db, repository: boot.repository }}>{children}</DatabaseContext>;
}

/** The repository for queries and mutations. Screens use this, never Drizzle directly. */
export function useRepository(): Repository {
  return useDatabase().repository;
}

/** For live-query hooks in src/db only. */
export function useDatabase(): DatabaseContextValue {
  const value = use(DatabaseContext);
  if (value === null) throw new Error("useDatabase must be used inside <DatabaseProvider>");
  return value;
}
