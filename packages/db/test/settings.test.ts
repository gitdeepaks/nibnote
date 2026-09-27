import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { schema } from "../src";
import { openTestDb } from "./helpers";

const Theme = z.enum(["light", "dark"]);

describe("settings", () => {
  test("missing values fall back to the default", () => {
    const { repo } = openTestDb();
    expect(repo.settings.get("theme", Theme, "light")).toBe("light");
  });

  test("set then get round-trips a validated value", () => {
    const { repo } = openTestDb();
    repo.settings.set("theme", Theme, "dark");
    expect(repo.settings.get("theme", Theme, "light")).toBe("dark");
    repo.settings.set("theme", Theme, "light");
    expect(repo.settings.get("theme", Theme, "dark")).toBe("light");
  });

  test("corrupt JSON or a value that fails its schema falls back instead of crashing", () => {
    const { db, repo } = openTestDb();
    db.insert(schema.settings).values({ key: "theme", valueJson: "{not json" }).run();
    expect(repo.settings.get("theme", Theme, "light")).toBe("light");
    db.update(schema.settings).set({ valueJson: JSON.stringify("sepia") }).run();
    expect(repo.settings.get("theme", Theme, "light")).toBe("light");
  });

  test("set refuses values that fail the schema", () => {
    const { repo } = openTestDb();
    // Input type is string, output is Theme: compiles with any string, validates at runtime.
    const ThemeFromString = z.string().pipe(Theme);
    expect(() => {
      repo.settings.set("theme", ThemeFromString, "sepia");
    }).toThrow();
  });
});
