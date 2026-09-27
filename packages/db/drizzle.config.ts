import { defineConfig } from "drizzle-kit";

// Plain SQL migrations; scripts/bundle-migrations.ts turns them into a typed module for the app.
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/schema.ts",
  out: "./drizzle",
});
