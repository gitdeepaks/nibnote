import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { app } from "./app";

const HealthResponse = z.object({ status: z.literal("ok") });

describe("GET /health", () => {
  test("returns ok", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(HealthResponse.parse(await res.json())).toEqual({ status: "ok" });
  });
});
