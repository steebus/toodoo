// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const setup = () => convexTest(schema, modules).withIdentity({ subject: "user_steve" });
const now = Date.parse("2026-10-12T02:00:00Z"); // 12:00 Brisbane

beforeEach(() => {
  vi.stubEnv("ALLOWED_USER_ID", "user_steve");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(now));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

it("creates, lists in rank order, updates and validates epics", async () => {
  const t = setup();
  const a = await t.mutation(api.epics.create, { epic: { title: "Tax", priority: "low" } });
  const b = await t.mutation(api.epics.create, { epic: { title: "Launch", priority: "high", status: "active" } });
  expect(a).toMatchObject({ title: "Tax", priority: "low", status: "planned", description: null, colour: "blue" });
  expect(b.colour).toBe("violet");
  expect((await t.mutation(api.epics.update, { id: b.id, patch: { colour: "amber" } })).colour).toBe("amber");
  await expect(t.mutation(api.epics.update, { id: b.id, patch: { colour: "red" } })).rejects.toThrow(/colour/);
  expect((await t.query(api.epics.list, {})).map((e) => e.title)).toEqual(["Launch", "Tax"]);
  const up = await t.mutation(api.epics.update, { id: a.id, patch: { status: "active", priority: "high", description: "BAS" } });
  expect(up).toMatchObject({ status: "active", priority: "high", description: "BAS" });
  await expect(t.mutation(api.epics.create, { epic: { title: "" } })).rejects.toThrow(/title/);
  await expect(t.mutation(api.epics.update, { id: a.id, patch: { status: "someday" } })).rejects.toThrow(/status/);
  await expect(t.mutation(api.epics.update, { id: b.id, patch: {} })).rejects.toThrow(/nothing to update/);
  await expect(t.mutation(api.epics.update, { id: "nope", patch: { title: "x" } })).rejects.toThrow(/epic not found/);
});

it("puts tasks in, moves them between and takes them out of epics", async () => {
  const t = setup();
  const one = await t.mutation(api.epics.create, { epic: { title: "One" } });
  const two = await t.mutation(api.epics.create, { epic: { title: "Two" } });
  const { created, errors } = await t.mutation(api.agent.addTasks, {
    tasks: [{ title: "In one", epic_id: one.id, status: "doing" }, { title: "Bad", epic_id: "nope" }, { title: "Loose" }],
  });
  expect(created.map((c) => c.title)).toEqual(["In one", "Loose"]);
  expect(errors).toEqual([{ index: 1, error: "epic not found" }]);
  const id = created[0].id;
  expect(await t.mutation(api.agent.updateTask, { id, patch: { epic_id: two.id } })).toMatchObject({ epic_id: two.id, status: "doing" });
  expect(await t.mutation(api.agent.updateTask, { id, patch: { epic_id: null, status: "blocked" } }))
    .toMatchObject({ epic_id: null, status: "blocked" });
  await expect(t.mutation(api.agent.updateTask, { id, patch: { epic_id: "nope" } })).rejects.toThrow(/epic not found/);
  await expect(t.mutation(api.agent.updateTask, { id, patch: { status: "done" } })).rejects.toThrow(/status/);
});

it("won't file a task under someone else's epic", async () => {
  const t = setup();
  const theirs = await t.run((ctx) => ctx.db.insert("epics", {
    user_id: "user_other", title: "Theirs", description: null, priority: null, status: "active",
    sort_order: 1, created_at: "", updated_at: 0,
  }));
  const { errors } = await t.mutation(api.agent.addTasks, { tasks: [{ title: "Sneaky", epic_id: theirs }] });
  expect(errors[0].error).toBe("epic not found");
  await expect(t.mutation(api.epics.update, { id: theirs, patch: { title: "Mine now" } })).rejects.toThrow(/epic not found/);
  await expect(t.mutation(api.epics.remove, { id: theirs })).rejects.toThrow(/epic not found/);
});

it("deleting an epic keeps its tasks, unfiled", async () => {
  const t = setup();
  const e = await t.mutation(api.epics.create, { epic: { title: "Doomed" } });
  const { created } = await t.mutation(api.agent.addTasks, { tasks: [{ title: "A", epic_id: e.id }, { title: "B", epic_id: e.id }] });
  const r = await t.mutation(api.epics.remove, { id: e.id });
  expect(r.task_ids.sort()).toEqual(created.map((c) => c.id).sort());
  const ws = await t.query(api.epics.workspace, { now });
  expect(ws.epics).toEqual([]);
  expect(ws.tasks.map((x) => x.epic_id)).toEqual([null, null]);
});

it("the workspace has open tasks and the last fortnight's done", async () => {
  const t = setup();
  const { created } = await t.mutation(api.agent.addTasks, { tasks: [{ title: "Open" }, { title: "Recent" }, { title: "Old" }] });
  await t.mutation(api.agent.updateTask, { id: created[1].id, patch: { done: true, done_on: "2026-10-01" } });
  await t.mutation(api.agent.updateTask, { id: created[2].id, patch: { done: true, done_on: "2026-09-01" } });
  const ws = await t.query(api.epics.workspace, { now });
  expect(ws.today).toBe("2026-10-12");
  expect(ws.tasks.map((x) => x.title).sort()).toEqual(["Open", "Recent"]);
  expect(ws.tasks.find((x) => x.title === "Open")).toMatchObject({ status: "todo", epic_id: null });
});

it("counts an epic's done tasks however long ago they were done", async () => {
  const t = setup();
  const e = await t.mutation(api.epics.create, { epic: { title: "Long haul" } });
  const { created } = await t.mutation(api.agent.addTasks, { tasks: [{ title: "Old", epic_id: e.id }, { title: "Open", epic_id: e.id }] });
  await t.mutation(api.agent.updateTask, { id: created[0].id, patch: { done: true, done_on: "2026-01-01" } });
  const ws = await t.query(api.epics.workspace, { now });
  expect(ws.done_counts).toEqual({ [e.id]: 1 });
  expect(ws.tasks.map((x) => x.title)).toEqual(["Open"]);
});

it("an epic's priority reaches the board's suggestions and the agent's snapshot", async () => {
  const t = setup();
  const hot = await t.mutation(api.epics.create, { epic: { title: "Hot", priority: "high", status: "active" } });
  const held = await t.mutation(api.epics.create, { epic: { title: "Held", priority: "high", status: "on_hold" } });
  await t.mutation(api.agent.addTasks, {
    tasks: [{ title: "Plain" }, { title: "Lifted", epic_id: hot.id }, { title: "Sunk", epic_id: held.id }],
  });
  const board = await t.query(api.agent.board, { now });
  expect(board.epics.map((e) => e.title)).toEqual(["Hot", "Held"]);
  expect(board.suggestions.map((s) => s.title)).toEqual(["Lifted", "Plain", "Sunk"]);
  expect(board.suggestions[0].reasons).toContain("high epic: Hot");
  expect(board.suggestions[2].reasons).toContain("Held on hold");
  const snap = await t.query(api.agent.getSnapshot, { now });
  expect(snap.tasks.due.find((x) => x.title === "Lifted")).toMatchObject({ epic: "Hot" });
  expect(snap.epics.map((e) => e.title)).toEqual(["Hot", "Held"]);
});

it("lets the agent name an epic and say a status in a tracker's words", async () => {
  const t = setup();
  const crooz = await t.mutation(api.epics.create, { epic: { title: "Croozn", status: "active" } });
  await t.mutation(api.epics.create, { epic: { title: "Website relaunch" } });
  const { created, errors } = await t.mutation(api.agent.addTasks, {
    tasks: [
      { title: "CROOZ-293 Bulk testing", epic: "croozn", status: "To Do", priority: "High priority" },
      { title: "Hero copy", epic: "relaunch", status: "In Progress" },
      { title: "Lost", epic: "Garden shed" },
    ],
  });
  expect(created.map((c) => c.title)).toEqual(["CROOZ-293 Bulk testing", "Hero copy"]);
  expect(errors[0].error).toMatch(/epic not found: Garden shed \(open epics: Croozn, Website relaunch\)/);
  const ws = await t.query(api.epics.workspace, { now });
  expect(ws.tasks.find((x) => x.title.startsWith("CROOZ"))).toMatchObject({ epic_id: crooz.id, status: "todo", priority: "high", note: null });
  expect(ws.tasks.find((x) => x.title === "Hero copy")).toMatchObject({ status: "doing" });
  const up = await t.mutation(api.agent.updateTask, { id: created[1].id, patch: { epic: "Croozn", status: "on hold" } });
  expect(up).toMatchObject({ epic_id: crooz.id, status: "blocked" });
  await expect(t.mutation(api.agent.updateTask, { id: created[1].id, patch: { status: "someday" } })).rejects.toThrow(/status must be/);
});
