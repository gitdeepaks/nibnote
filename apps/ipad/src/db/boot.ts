import { createRepository, migrationBundle, pendingMigrationCount, type Repository } from "@nibnote/db";
import { randomUUID } from "expo-crypto";
import { openDatabaseSync, type SQLiteDatabase } from "expo-sqlite";
import { drizzle, type ExpoSQLiteDatabase } from "drizzle-orm/expo-sqlite";
import { migrate } from "drizzle-orm/expo-sqlite/migrator";
import { deletePurgedFiles } from "./files";
import { databaseDirectory, databaseFiles, LOCAL_DATABASE_NAME, toFilesystemPath } from "./locations";

export type DatabaseBoot =
  | { readonly kind: "ready"; readonly db: ExpoSQLiteDatabase; readonly repository: Repository }
  | { readonly kind: "failed"; readonly message: string; readonly restoredBackup: boolean };

function open(directoryPath: string): SQLiteDatabase {
  const client = openDatabaseSync(LOCAL_DATABASE_NAME, { enableChangeListener: true }, directoryPath);
  client.execSync("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  return client;
}

/**
 * Opens the local database and brings it up to date. Before applying migrations to an existing
 * database it writes a consistent copy with `VACUUM INTO`; if a migration fails, the copy is put
 * back and the app shows a recovery screen instead of crashing (build plan: data safety).
 */
export async function bootDatabase(): Promise<DatabaseBoot> {
  const directory = databaseDirectory();
  directory.create({ intermediates: true, idempotent: true });
  const directoryPath = toFilesystemPath(directory.uri);
  const files = databaseFiles(LOCAL_DATABASE_NAME);

  const client = open(directoryPath);
  const db = drizzle(client);
  const pending = pendingMigrationCount(db, migrationBundle);
  const isFreshDatabase = pending === migrationBundle.journal.entries.length;
  const backupPath = toFilesystemPath(files.backup.uri);

  if (pending > 0 && !isFreshDatabase) {
    if (files.backup.exists) files.backup.delete();
    client.execSync(`VACUUM INTO '${backupPath.replaceAll("'", "''")}'`);
  }

  try {
    await migrate(db, migrationBundle);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown migration error";
    client.closeSync();
    const canRestore = !isFreshDatabase && files.backup.exists;
    // A fresh database holds no user data: remove the half-migrated file so the next launch starts
    // clean. An existing one is replaced by its pre-migration copy.
    if (isFreshDatabase || canRestore) {
      for (const file of [files.main, files.wal, files.shm]) {
        if (file.exists) file.delete();
      }
    }
    if (canRestore) await files.backup.copy(files.main, { overwrite: true });
    return { kind: "failed", message, restoredBackup: canRestore };
  }

  const repository = createRepository(db, { now: () => Date.now(), newId: () => randomUUID() });
  deletePurgedFiles(repository.trash.purgeExpired());
  return { kind: "ready", db, repository };
}
