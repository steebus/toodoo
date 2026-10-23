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
  expect(second.skipped).toEqual([{ title: "Review PR", source: "jira", external_id: "jira:T-1", id: first.created[0].id }]);
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
  await t.mutation(api.agent.addTasks, { tasks: [{ title: "Undated thing" }] });
  await t.mutation(api.agent.setDay, { day: { date: "2026-10-12", headline: "Clear arvo", events: [{ start: "9:15", end: "09:30", title: "Standup" }] } });
  const s = await t.query(api.agent.getSnapshot, {});
  expect(s.today).toBe("2026-10-12");
  expect(s.tasks.undated.map((x) => x.title)).toEqual(["Undated thing"]);
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
  expect(b.blocks).toEqual([{ id: expect.any(String), task_id: created[0].id, date: "2026-10-12", start: "13:05", mins: 50 }]);
});

it("placeBlock clamps to the day and snaps", async () => {
  const t = setup();
  const { created } = await t.mutation(api.agent.addTasks, { tasks: [{ title: "Late" }] });
  await t.mutation(api.agent.placeBlock, { task_id: created[0].id, date: "2026-10-12", start: "23:55", mins: 120 });
  const b = await t.query(api.agent.board, {});
  expect(b.blocks[0]).toMatchObject({ start: "23:55", mins: 5 }); // the last 5 minutes of the day
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

it("the board says how much of each estimate has been spent, from blocks gone by", async () => {
  const t = setup();
  const { created } = await t.mutation(api.agent.addTasks, { tasks: [{ title: "Sized", estimate_mins: 120 }, { title: "Unsized" }] });
  await t.mutation(api.agent.placeBlock, { task_id: created[0].id, date: "2026-10-11", start: "09:00", mins: 60 });
  await t.mutation(api.agent.placeBlock, { task_id: created[0].id, date: "2026-10-12", start: "11:30", mins: 60 }); // half gone by 12:00
  await t.mutation(api.agent.placeBlock, { task_id: created[1].id, date: "2026-10-11", start: "09:00", mins: 30 });
  const b = await t.query(api.agent.board, { now: Date.parse("2026-10-12T02:00:00Z") });
  expect(b.effort).toEqual({ [created[0].id]: { planned: 120, actual: 90 } });
});

it("keeps a task's checklist, tidied, and reports it to the agent", async () => {
  const t = setup();
  const { created } = await t.mutation(api.agent.addTasks, { tasks: [{ title: "Pack", checklist: ["Passports", " ", { text: "Chargers", done: true }] }] });
  const id = created[0].id;
  const snap = await t.query(api.agent.getSnapshot, { now: Date.parse("2026-10-12T02:00:00Z") });
  expect(snap.tasks.undated[0]).toMatchObject({ checklist: [{ text: "Passports", done: false }, { text: "Chargers", done: true }] });
  const up = await t.mutation(api.agent.updateTask, { id, patch: { checklist: [{ text: "Passports", done: true }] } });
  expect(up.checklist).toEqual([{ text: "Passports", done: true }]);
  await expect(t.mutation(api.agent.updateTask, { id, patch: { checklist: Array(51).fill("x") } })).rejects.toThrow(/checklist/);
});

it("a task can hold several blocks in a day; each moves and goes on its own, and all count as time spent", async () => {
  const t = setup();
  const { created } = await t.mutation(api.agent.addTasks, { tasks: [{ title: "Deep work", estimate_mins: 180 }] });
  const id = created[0].id;
  const am = await t.mutation(api.agent.placeBlock, { task_id: id, date: "2026-10-12", start: "09:00", mins: 60 });
  const pm = await t.mutation(api.agent.placeBlock, { task_id: id, date: "2026-10-12", start: "14:00", mins: 60 });
  expect(am.id).not.toBe(pm.id);
  const moved = await t.mutation(api.agent.placeBlock, { task_id: id, date: "2026-10-12", start: "14:30", mins: 90, block_id: pm.id });
  expect(moved).toMatchObject({ id: pm.id, start: "14:30", mins: 90 });
  let b = await t.query(api.agent.board, { now: Date.parse("2026-10-12T05:00:00Z") }); // 15:00 Brisbane
  expect(b.blocks.map((x) => x.start).sort()).toEqual(["09:00", "14:30"]);
  expect(b.effort[id]).toEqual({ planned: 150, actual: 90 }); // all of the morning, half an hour of the afternoon
  await t.mutation(api.agent.removeBlock, { task_id: id, date: "2026-10-12", block_id: am.id });
  b = await t.query(api.agent.board, { now: Date.parse("2026-10-12T05:00:00Z") });
  expect(b.blocks.map((x) => x.start)).toEqual(["14:30"]);
  await expect(t.mutation(api.agent.placeBlock, { task_id: id, date: "2026-10-12", start: "10:00", mins: 30, block_id: "nope" })).rejects.toThrow(/block not found/);
});

it("plan adds another block for a task already on the line, at mins, and says the new block's id", async () => {
  const t = setup();
  const { created } = await t.mutation(api.agent.addTasks, { tasks: [{ title: "Report", estimate_mins: 120 }] });
  const id = created[0].id;
  await t.mutation(api.agent.placeBlock, { task_id: id, date: "2026-10-12", start: "13:00", mins: 30 });
  const r = await t.mutation(api.agent.plan, { task_ids: [id], from: "15:00", until: "17:00", mins: 45, commit: true, now: Date.parse("2026-10-12T02:00:00Z") });
  expect(r.proposed).toEqual([{ id: expect.any(String), task_id: id, title: "Report", start: "15:00", mins: 45 }]);
  const b = await t.query(api.agent.board, { now: Date.parse("2026-10-12T02:00:00Z") });
  expect(b.blocks.filter((x) => x.task_id === id).map((x) => x.start).sort()).toEqual(["13:00", "15:00"]);
});

it("placeBlock folds a task's overlapping or touching plans into one", async () => {
  const t = setup();
  const { created } = await t.mutation(api.agent.addTasks, { tasks: [{ title: "Long job" }] });
  const place = (start: string, mins: number) => t.mutation(api.agent.placeBlock, { task_id: created[0].id, date: "2026-10-12", start, mins });
  await place("08:00", 60);
  await place("09:00", 30); // touches: extends
  await place("13:00", 60); // a gap: its own plan
  expect((await t.query(api.agent.board, {})).blocks.map((x) => [x.start, x.mins]).sort()).toEqual([["08:00", 90], ["13:00", 60]]);
  await place("08:30", 300); // overlaps the first, reaches the second
  expect((await t.query(api.agent.board, {})).blocks.map((x) => [x.start, x.mins])).toEqual([["08:00", 360]]);
});

it("mergeBlocks folds plans made before the rule into one", async () => {
  const t = setup();
  const { created } = await t.mutation(api.agent.addTasks, { tasks: [{ title: "Old" }] });
  await t.run(async (ctx) => {
    const user_id = (await ctx.db.query("tasks").first())!.user_id;
    for (const [start, mins] of [["08:00", 205], ["10:35", 255], ["13:00", 180]] as const)
      await ctx.db.insert("plan_blocks", { user_id, date: "2026-10-12", task_id: created[0].id as never, start, mins });
  });
  await t.mutation(api.agent.mergeBlocks, { date: "2026-10-12" });
  expect((await t.query(api.agent.board, {})).blocks.map((x) => [x.start, x.mins])).toEqual([["08:00", 480]]);
});

it("assigns to Claude: keeps the #claude tag, lands in To do, and Claude's done goes to Review for Steve", async () => {
  const t = setup();
  const { created } = await t.mutation(api.agent.addTasks, { tasks: [{ title: "Fix it", tags: ["work"] }, { title: "Claude's", assignee: "@claude" }] });
  const [mine, theirs] = created.map((c) => c.id);
  const row = (id: string) => t.run((ctx) => ctx.db.get(id as any));
  expect(await row(mine)).not.toHaveProperty("assignee"); // everything is Steve's by default
  expect(await row(theirs)).toMatchObject({ assignee: "claude", claude_status: "todo", tags: ["claude"] });
  const a = await t.mutation(api.agent.updateTask, { id: mine, patch: { assignee: "claude" } });
  expect(a).toMatchObject({ assignee: "claude", claude_status: "todo" });
  expect(await row(mine)).toMatchObject({ tags: ["work", "claude"] });
  // the app's own tick closes it; Claude's (over MCP) sends it to Review and back to Steve
  const r: any = await t.mutation(api.agent.updateTask, { id: mine, patch: { done: true }, agent: true });
  expect(r).toMatchObject({ done: false, assignee: "steve", claude_status: "review", moved_to_review: true });
  expect(await row(mine)).toMatchObject({ tags: ["work", "claude"] });
  const closed: any = await t.mutation(api.agent.updateTask, { id: mine, patch: { claude_status: "done" } });
  expect(closed).toMatchObject({ done: true, claude_status: "done" });
  // the tag is never taken off, even by a tags patch
  await t.mutation(api.agent.updateTask, { id: theirs, patch: { tags: ["other"] } });
  expect(await row(theirs)).toMatchObject({ tags: ["other", "claude"] });
  await expect(t.mutation(api.agent.updateTask, { id: theirs, patch: { assignee: "bob" } })).rejects.toThrow(/assignee must be/);
});

it("a task that only carries #claude still finishes as before (done stays done) and is found by @claude", async () => {
  const t = setup();
  const { created } = await t.mutation(api.agent.addTasks, { tasks: [{ title: "Old style", tags: ["claude"] }, { title: "Parked", tags: ["claude"], status: "backlog" }, { title: "Steve's" }] });
  const snap: any = await t.query(api.agent.getSnapshot, { query: "@claude", now: Date.now() });
  expect(snap.tasks.undated.map((x: any) => x.title)).toEqual(["Old style"]);
  const r: any = await t.mutation(api.agent.updateTask, { id: created[0].id, patch: { done: true }, agent: true });
  expect(r).toMatchObject({ done: true });
  expect(r).not.toHaveProperty("moved_to_review");
  const tagged: any = await t.query(api.agent.getSnapshot, { query: "#claude", now: Date.now() });
  expect(tagged.tasks.undated.map((x: any) => x.title)).toEqual(["Parked"]);
});
