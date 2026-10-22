// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const setup = () => convexTest(schema, modules).withIdentity({ subject: "user_steve" });

beforeEach(() => vi.stubEnv("ALLOWED_USER_ID", "user_steve"));
afterEach(() => vi.unstubAllEnvs());

type T = ReturnType<typeof setup>;
const upload = (t: T, body: string) => t.run((ctx) => ctx.storage.store(new Blob([body]))) as Promise<Id<"_storage">>;
// A filed attachment (add answers { error } when it can't file one).
const add = async (t: T, task_id: string, body: string, name: string, type?: string) => {
  const r = await t.mutation(api.attachments.add, { task_id, storage_id: await upload(t, body), name, type });
  if ("error" in r) throw new Error(r.error);
  return r;
};
const task = async (t: T, title = "Receipts") => {
  const { created } = await t.mutation(api.agent.addTasks, { tasks: [{ title }] });
  return created[0].id as string;
};
const countOf = async (t: T, id: string) =>
  (await t.query(api.agent.board, {})).tasks.find((x) => x.id === id)?.attachments;

it("files, lists, renames, replaces and removes a task's attachments, keeping its count", async () => {
  const t = setup();
  const id = await task(t);
  const pic = await add(t, id, "png", "shot.png", "image/png");
  const doc = await add(t, id, "pdf!", "a/b.pdf", "application/pdf; evil");
  expect(pic).toMatchObject({ name: "shot.png", type: "image/png", size: 3 });
  expect(doc).toMatchObject({ name: "a b.pdf", type: "application/octet-stream" });
  expect(pic.url).toMatch(/^https:/);
  expect((await t.query(api.attachments.list, { task_id: id })).map((f) => f.name)).toEqual(["shot.png", "a b.pdf"]);
  expect(await countOf(t, id)).toBe(2);

  await t.mutation(api.attachments.rename, { id: doc.id, name: "  invoice.pdf " });
  await expect(t.mutation(api.attachments.rename, { id: doc.id, name: " " })).rejects.toThrow(/needs a name/);
  const swapped = await t.mutation(api.attachments.replace, { id: pic.id, storage_id: await upload(t, "jpeg!!"), name: "shot.jpg", type: "image/jpeg" });
  expect(swapped).toMatchObject({ name: "shot.jpg", type: "image/jpeg", size: 6 });
  expect((await t.query(api.attachments.list, { task_id: id })).map((f) => f.name)).toEqual(["shot.jpg", "invoice.pdf"]);

  await t.mutation(api.attachments.remove, { id: pic.id });
  expect((await t.query(api.attachments.list, { task_id: id })).map((f) => f.name)).toEqual(["invoice.pdf"]);
  expect(await countOf(t, id)).toBe(1);
  await t.mutation(api.attachments.remove, { id: doc.id });
  expect(await countOf(t, id)).toBeUndefined(); // no paperclip
  expect(await t.run((ctx) => ctx.db.system.query("_storage").collect())).toHaveLength(0); // the old versions went too
});

it("deletes an upload it can't file, and a task's files go with it", async () => {
  const t = setup();
  const id = await task(t);
  const loose = await upload(t, "x");
  expect(await t.mutation(api.attachments.add, { task_id: "nope", storage_id: loose, name: "x.txt" })).toEqual({ error: "task not found" });
  expect(await t.run((ctx) => ctx.storage.getUrl(loose))).toBeNull();
  const stray = await upload(t, "w");
  expect(await t.mutation(api.attachments.replace, { id: "nope", storage_id: stray, name: "w.txt" })).toEqual({ error: "attachment not found" });
  expect(await t.run((ctx) => ctx.storage.getUrl(stray))).toBeNull();

  await add(t, id, "y", "y.txt");
  await t.mutation(api.agent.deleteTask, { id });
  expect(await t.run((ctx) => ctx.db.query("attachments").collect())).toHaveLength(0);
  expect(await t.run((ctx) => ctx.db.system.query("_storage").collect())).toHaveLength(0);
});

it("keeps other people out", async () => {
  const t = setup();
  const id = await task(t);
  const f = await add(t, id, "z", "z.txt");
  const stranger = t.withIdentity({ subject: "user_eve" });
  await expect(stranger.query(api.attachments.list, { task_id: id })).rejects.toThrow(/not allowed/);
  await expect(t.mutation(api.attachments.rename, { id: "nope", name: "q" })).rejects.toThrow(/attachment not found/);
  expect(f.id).toBeTruthy();
});
