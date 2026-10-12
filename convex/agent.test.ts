// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { listBySource } from "./model";

const modules = import.meta.glob("./**/*.ts");
const setup = () => convexTest(schema, modules).withIdentity({ subject: "user_steve" });

beforeEach(() => {
  vi.stubEnv("ALLOWED_USER_ID", "user_steve");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-12T02:00:00Z")); // 12:00 Brisbane
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

it("adds tasks idempotently on source + external_id", async () => {
  const t = setup();
  const input = [{ title: "Review PR", source: "jira", external_id: "jira:T-1" }, { title: "Mine" }, { title: "" }];
  const first = await t.mutation(api.agent.addTasks, { tasks: input });
  expect(first.created.map((c) => c.title)).toEqual(["Review PR", "Mine"]);
  expect(first.errors.map((e) => e.index)).toEqual([2]);
  const second = await t.mutation(api.agent.addTasks, { tasks: input.slice(0, 1) });
  expect(second.created).toEqual([]);
  expect(second.skipped).toEqual([{ title: "Review PR", source: "jira", external_id: "jira:T-1" }]);
});

it("requires the allowed user", async () => {
  const anon = convexTest(schema, modules);
  await expect(anon.mutation(api.agent.addTasks, { tasks: [{ title: "x" }] })).rejects.toThrow(/sign in required/);
});

it("ticks a task and reports unknown ids cleanly", async () => {
  const t = setup();
  const { created } = await t.mutation(api.agent.addTasks, { tasks: [{ title: "Tick me", priority: "high" }] });
  const done = await t.mutation(api.agent.updateTask, { id: created[0].id, patch: { done: true } });
  expect(done).toMatchObject({ done: true, done_on: "2026-10-12", priority: "high" });
  await expect(t.mutation(api.agent.updateTask, { id: "nonsense", patch: { done: true } })).rejects.toThrow(/task not found/);
});

it("deleting a task deletes its blocks", async () => {
  const t = setup();
  const { created } = await t.mutation(api.agent.addTasks, { tasks: [{ title: "Block me" }] });
  await t.mutation(api.agent.plan, { from: "13:00", until: "17:00", commit: true });
  await t.mutation(api.agent.deleteTask, { id: created[0].id });
  const left = await t.run((ctx) => ctx.db.query("plan_blocks").collect());
  expect(left).toEqual([]);
});

it("plans only on commit, and unplans", async () => {
  const t = setup();
  await t.mutation(api.agent.addTasks, { tasks: [{ title: "Deep work", priority: "high" }] });
  const preview = await t.mutation(api.agent.plan, { from: "13:00", until: "17:00" });
  expect(preview).toMatchObject({ committed: false, proposed: [{ title: "Deep work", start: "13:00", mins: 60 }] });
  expect(await t.run((ctx) => ctx.db.query("plan_blocks").collect())).toHaveLength(0);
  const saved = await t.mutation(api.agent.plan, { from: "13:00", until: "17:00", commit: true });
  expect(saved.committed).toBe(true);
  expect(await t.mutation(api.agent.unplan, { date: "2026-10-12", task_ids: [] })).toEqual({ removed: 0 });
  expect(await t.mutation(api.agent.unplan, { date: "2026-10-12", task_ids: ["garbage"] })).toEqual({ removed: 0 });
  expect(await t.mutation(api.agent.unplan, { date: "2026-10-12" })).toEqual({ removed: 1 });
});

it("snapshot shows today's tasks, the day and the plan", async () => {
  const t = setup();
  await t.mutation(api.agent.addTasks, { tasks: [{ title: "Today thing" }] });
  await t.mutation(api.agent.setDay, { day: { date: "2026-10-12", headline: "Clear arvo", events: [{ start: "9:15", end: "09:30", title: "Standup" }] } });
  const s = await t.query(api.agent.getSnapshot, {});
  expect(s.today).toBe("2026-10-12");
  expect(s.tasks.due.map((x) => x.title)).toEqual(["Today thing"]);
  expect(s.day).toMatchObject({ headline: "Clear arvo", events: [{ start: "09:15", title: "Standup" }] });
});

it("rejects malformed dates cleanly", async () => {
  const t = setup();
  await expect(t.query(api.agent.getSnapshot, { date: "garbage" })).rejects.toThrow(/date must be YYYY-MM-DD/);
  await expect(t.mutation(api.agent.plan, { date: "2026-02-31" })).rejects.toThrow(/date must be YYYY-MM-DD/);
});

it("listBySource finds a source's old done tasks beyond the recent 200", async () => {
  const t = setup();
  const base = { user_id: "user_steve", due: "2026-01-01", time: null, priority: null, estimate_mins: null, tags: [], done: true, done_on: "2026-01-02", sort_order: 1, created_at: "x", updated_at: 1, description: null, note: null, link: null, external_id: null };
  await t.run(async (ctx) => {
    for (let i = 0; i < 3; i++) await ctx.db.insert("tasks", { ...base, title: `t${i}`, source: "trippn" });
    for (let i = 0; i < 210; i++) await ctx.db.insert("tasks", { ...base, title: `y${i}`, source: "you" });
  });
  const r = await t.run((ctx) => listBySource(ctx.db, "user_steve", "trippn"));
  expect(r).toHaveLength(3);
});

it("getSnapshot honours a caller-supplied now over the clock", async () => {
  const s = await setup().query(api.agent.getSnapshot, { now: Date.parse("2026-10-13T02:00:00Z") });
  expect(s.today).toBe("2026-10-13");
});
