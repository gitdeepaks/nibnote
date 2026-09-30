import { describe, expect, test } from "bun:test";
import { DEFAULT_TOOLBOX, HexColor, selectSlot, setSlotColor } from "@nibnote/shared";
import { schema } from "../src";
import { openTestDb } from "./helpers";

describe("toolbox", () => {
  test("a fresh install starts with the default tools", () => {
    const { repo } = openTestDb();
    expect(repo.toolbox.load()).toEqual(DEFAULT_TOOLBOX);
  });

  test("the active tool and each slot's colour survive a restart", () => {
    const { repo } = openTestDb();
    const red = HexColor.parse("#E5383B");
    const toolbox = selectSlot(setSlotColor(DEFAULT_TOOLBOX, "pen", red), "highlighter");
    repo.toolbox.save(toolbox);
    expect(repo.toolbox.load()).toEqual(toolbox);
  });

  test("is device-local: saving doesn't queue a sync change", () => {
    const { repo, outbox } = openTestDb();
    repo.toolbox.save(selectSlot(DEFAULT_TOOLBOX, "eraser"));
    expect(outbox()).toEqual([]);
  });

  test("a corrupt stored value gives the defaults instead of crashing the editor", () => {
    const { db, repo } = openTestDb();
    db.insert(schema.settings).values({ key: "toolbox", valueJson: "{not json" }).run();
    expect(repo.toolbox.load()).toEqual(DEFAULT_TOOLBOX);
  });
});
