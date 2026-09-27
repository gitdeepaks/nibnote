import { eq } from "drizzle-orm";
import type { z } from "zod";
import { settings } from "../schema";
import type { Db } from "./types";

// Device-local preferences. A missing or corrupt value never crashes: it falls back to the default.

export function createSettingsQueries<R>(db: Db<R>) {
  return {
    get<Schema extends z.ZodType>(key: string, schema: Schema, fallback: z.output<Schema>): z.output<Schema> {
      const row = db.select().from(settings).where(eq(settings.key, key)).get();
      if (row === undefined) return fallback;
      try {
        const parsed = schema.safeParse(JSON.parse(row.valueJson));
        return parsed.success ? parsed.data : fallback;
      } catch {
        return fallback;
      }
    },

    set<Schema extends z.ZodType>(key: string, schema: Schema, value: z.input<Schema>): void {
      const valueJson = JSON.stringify(schema.parse(value));
      db.insert(settings)
        .values({ key, valueJson })
        .onConflictDoUpdate({ target: settings.key, set: { valueJson } })
        .run();
    },
  };
}
