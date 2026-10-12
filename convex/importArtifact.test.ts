// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { beforeEach, expect, it, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
beforeEach(() => { vi.stubEnv("ALLOWED_USER_ID", "user_steve"); });
const row = (title: string, external_id: string) => ({
  title, description: null, note: null, link: null, source: "jira", external_id, due: "2026-10-01", time: null,
  priority: null, estimate_mins: null, tags: ["work"], done: false, done_on: null, sort_order: 1, created_at: "2026-10-01T00:00:00Z",
});
const body = {
  tasks: [row("A", "jira:A-1"), row("B", "jira:B-1")],
  days: [{ date: "2026-10-01", headline: "Hi", events: [] }],
  blocks: [
    { date: "2026-10-01", source: "jira", external_id: "jira:A-1", start: "09:00", mins: 30 },
    { date: "2026-10-01", source: "jira", external_id: "jira:GONE", start: "10:00", mins: 30 },
  ],
};

it("imports idempotently and drops orphan blocks", async () => {
  const t = convexTest(schema, modules);
  expect(await t.mutation(internal.importArtifact.run, body)).toEqual({ tasks: 2, days: 1, blocks: 1, dropped: 1 });
  expect(await t.mutation(internal.importArtifact.run, body)).toEqual({ tasks: 2, days: 1, blocks: 1, dropped: 1 });
  const counts = await t.run(async (ctx) => [
    (await ctx.db.query("tasks").collect()).length,
    (await ctx.db.query("days").collect()).length,
    (await ctx.db.query("plan_blocks").collect()).length,
  ]);
  expect(counts).toEqual([2, 1, 1]);
});
