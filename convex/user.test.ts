// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { beforeEach, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
beforeEach(() => { vi.stubEnv("ALLOWED_USER_ID", "user_steve"); });

it("rejects anonymous callers", async () => {
  await expect(convexTest(schema, modules).query(api.me.me, {})).rejects.toThrow(/sign in required/);
});
it("rejects other users", async () => {
  const t = convexTest(schema, modules).withIdentity({ subject: "user_other" });
  await expect(t.query(api.me.me, {})).rejects.toThrow(/not allowed/);
});
it("admits the allowed user", async () => {
  const t = convexTest(schema, modules).withIdentity({ subject: "user_steve" });
  expect(await t.query(api.me.me, {})).toBe("user_steve");
});
