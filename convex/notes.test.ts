// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const setup = () => convexTest(schema, modules).withIdentity({ subject: "user_steve" });
beforeEach(() => vi.stubEnv("ALLOWED_USER_ID", "user_steve"));
afterEach(() => vi.unstubAllEnvs());

const task = async (t: ReturnType<typeof setup>, o: object = {}) =>
  (await t.mutation(api.agent.addTasks, { tasks: [{ title: "Receipts", ...o }] })).created[0].id as string;
const noteOf = async (t: ReturnType<typeof setup>, id: string) => (await t.query(api.agent.board, {})).tasks.find((x) => x.id === id)?.note;

it("threads replies one level deep and keeps the task's note on the latest", async () => {
  const t = setup();
  const id = await task(t);
  const a = await t.mutation(api.notes.add, { task_id: id, text: "First" });
  const r = await t.mutation(api.notes.add, { task_id: id, text: "Reply", parent_id: a.id });
  const rr = await t.mutation(api.notes.add, { task_id: id, text: "Reply to reply", parent_id: r.id });
  expect(r.parent_id).toBe(a.id);
  expect(rr.parent_id).toBe(a.id);
  expect((await t.query(api.notes.list, { task_id: id })).map((n) => n.text)).toEqual(["First", "Reply", "Reply to reply"]);
  expect(await noteOf(t, id)).toBe("Reply to reply");
  await t.mutation(api.notes.remove, { id: rr.id });
  expect(await noteOf(t, id)).toBe("Reply");
  await t.mutation(api.notes.remove, { id: a.id });
  expect(await t.query(api.notes.list, { task_id: id })).toEqual([]);
  expect(await noteOf(t, id)).toBeNull();
});

it("turns a bare note into the first comment, and an agent's note into a Claude comment", async () => {
  const t = setup();
  const id = await task(t, { note: "Old" });
  await t.mutation(api.notes.add, { task_id: id, text: "New" });
  expect((await t.query(api.notes.list, { task_id: id })).map((n) => [n.author, n.text])).toEqual([["steve", "Old"], ["steve", "New"]]);
  await t.mutation(api.agent.updateTask, { id, patch: { note: "Shipped" }, agent: true });
  const list = await t.query(api.notes.list, { task_id: id });
  expect(list.at(-1)).toMatchObject({ author: "claude", text: "Shipped" });
  expect(await noteOf(t, id)).toBe("Shipped");
  await t.mutation(api.agent.updateTask, { id, patch: { note: "By hand" } });
  expect(await noteOf(t, id)).toBe("By hand");
});

it("refuses empty text", async () => {
  const t = setup();
  const id = await task(t);
  await expect(t.mutation(api.notes.add, { task_id: id, text: "  " })).rejects.toThrow();
});

it("a first reply to a pre-thread note hangs under it", async () => {
  const t = setup();
  const id = await task(t, { note: "Old" });
  const r = await t.mutation(api.notes.add, { task_id: id, text: "Re", parent_id: "legacy" });
  const list = await t.query(api.notes.list, { task_id: id });
  expect(list.map((n) => [n.text, n.parent_id])).toEqual([["Old", null], ["Re", list[0].id]]);
  expect(r.parent_id).toBe(list[0].id);
});
