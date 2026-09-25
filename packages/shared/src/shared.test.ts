import { describe, expect, test } from "bun:test";
import { err, NotebookId, ok, PageId, type Result } from "./index";

const uuid = "8f14e45f-ceea-467a-9575-5e1b5c6d7a10";

describe("branded ids", () => {
  test("accept a UUID", () => {
    expect(PageId.safeParse(uuid).success).toBe(true);
    expect(NotebookId.safeParse(uuid).success).toBe(true);
  });

  test("reject anything else", () => {
    expect(PageId.safeParse("not-a-uuid").success).toBe(false);
    expect(PageId.safeParse(42).success).toBe(false);
  });
});

describe("Result", () => {
  function describeResult(result: Result<number, string>): string {
    return result.ok ? `value ${String(result.value)}` : `error ${result.error}`;
  }

  test("ok and err narrow correctly", () => {
    expect(describeResult(ok(1))).toBe("value 1");
    expect(describeResult(err("boom"))).toBe("error boom");
  });
});

