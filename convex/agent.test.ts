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

it("board returns full tasks, blocks and suggestions for the day", async () => {
  const t = setup();
  const { created } = await t.mutation(api.agent.addTasks, { tasks: [{ title: "Board me", priority: "high", description: "why" }] });
  await t.mutation(api.agent.placeBlock, { task_id: created[0].id, date: "2026-10-12", start: "13:07", mins: 50 });
  const b = await t.query(api.agent.board, {});
  expect(b.today).toBe("2026-10-12");
  expect(b.tasks.find((x) => x.id === created[0].id)).toMatchObject({ title: "Board me", description: "why", priority: "high" });
  expect(b.blocks).toEqual([{ task_id: created[0].id, date: "2026-10-12", start: "13:00", mins: 45 }]);
});

it("placeBlock clamps to the day and snaps", async () => {
  const t = setup();
  const { created } = await t.mutation(api.agent.addTasks, { tasks: [{ title: "Late" }] });
  await t.mutation(api.agent.placeBlock, { task_id: created[0].id, date: "2026-10-12", start: "23:55", mins: 120 });
  const b = await t.query(api.agent.board, {});
  expect(b.blocks[0]).toMatchObject({ start: "23:45", mins: 15 });
  await expect(t.mutation(api.agent.placeBlock, { task_id: "nope", date: "2026-10-12", start: "10:00", mins: 30 }))
    .rejects.toThrow(/task not found/);
});

it("removeBlock removes only that task's block on that date", async () => {
  const t = setup();
  const { created } = await t.mutation(api.agent.addTasks, { tasks: [{ title: "A" }, { title: "B" }] });
  for (const c of created) await t.mutation(api.agent.placeBlock, { task_id: c.id, date: "2026-10-12", start: "10:00", mins: 30 });
  await t.mutation(api.agent.removeBlock, { task_id: created[0].id, date: "2026-10-12" });
  expect((await t.query(api.agent.board, {})).blocks.map((x) => x.task_id)).toEqual([created[1].id]);
});

it("board, placeBlock and removeBlock need a signed-in user", async () => {
  const anon = convexTest(schema, modules);
  await expect(anon.query(api.agent.board, {})).rejects.toThrow(/sign in required/);
  await expect(anon.mutation(api.agent.placeBlock, { task_id: "x", date: "2026-10-12", start: "10:00", mins: 30 })).rejects.toThrow(/sign in required/);
  await expect(anon.mutation(api.agent.removeBlock, { task_id: "x", date: "2026-10-12" })).rejects.toThrow(/sign in required/);
});

it("board, placeBlock and removeBlock never reach another user's task", async () => {
  const t = setup();
  const theirs = await t.run(async (ctx) => {
    const id = await ctx.db.insert("tasks", {
      user_id: "user_other", title: "Theirs", description: null, note: null, link: null, source: "you", external_id: null,
      due: "2026-10-12", time: null, priority: null, estimate_mins: null, tags: [], done: false, done_on: null, sort_order: 1, created_at: "2026-10-12", updated_at: 0,
    });
    await ctx.db.insert("plan_blocks", { user_id: "user_other", date: "2026-10-12", task_id: id, start: "10:00", mins: 30 });
    return id;
  });
  const b = await t.query(api.agent.board, {});
  expect(b.tasks.some((x) => x.id === theirs)).toBe(false);
  expect(b.blocks).toEqual([]);
  await expect(t.mutation(api.agent.placeBlock, { task_id: theirs, date: "2026-10-12", start: "11:00", mins: 30 })).rejects.toThrow(/task not found/);
  await t.mutation(api.agent.removeBlock, { task_id: theirs, date: "2026-10-12" });
  expect(await t.run((ctx) => ctx.db.query("plan_blocks").collect())).toMatchObject([{ task_id: theirs, start: "10:00" }]);
});
