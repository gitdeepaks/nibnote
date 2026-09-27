import { Directory, File, Paths } from "expo-file-system";

// Where the local database lives. One database per account (build plan): `local` is the
// signed-out database; signed-in databases arrive in Phase 4.

export const LOCAL_DATABASE_NAME = "local.db";

export function databaseDirectory(): Directory {
  return new Directory(Paths.document, "SQLite");
}

export function databaseFiles(name: string) {
  const directory = databaseDirectory();
  return {
    main: new File(directory, name),
    wal: new File(directory, `${name}-wal`),
    shm: new File(directory, `${name}-shm`),
    backup: new File(directory, `${name}.pre-migration.bak`),
  };
}

/** expo-sqlite takes a plain filesystem path for its directory, not a `file://` URI. */
export function toFilesystemPath(uri: string): string {
  return decodeURIComponent(new URL(uri).pathname).replace(/\/+$/, "");
}
