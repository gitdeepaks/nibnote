import { z } from "zod";

// Shape Drizzle's expo-sqlite migrator expects: journal entries plus SQL keyed `m0000`, `m0001`, …
export type MigrationBundle = {
  journal: {
    entries: { idx: number; when: number; tag: string; breakpoints: boolean }[];
  };
  migrations: Record<string, string>;
};

export const MigrationJournal = z.object({
  entries: z.array(
    z.object({
      idx: z.number().int().nonnegative(),
      when: z.number(),
      tag: z.string().min(1),
      breakpoints: z.boolean(),
    }),
  ),
});

export function migrationKey(idx: number): string {
  return `m${idx.toString().padStart(4, "0")}`;
}
