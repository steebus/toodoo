import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { requireUser } from "./lib/user";
import * as m from "./model";
import { lookalikes, mergePatch, type Mergeable, type Proposal } from "../shared/inbox.ts";
import { InputError, prepareTasks } from "../shared/validation.ts";

type R = QueryCtx["db"];
type W = MutationCtx["db"];
type Row = Doc<"inbox">;

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

async function owned(db: R, userId: string, id: string) {
  const nid = db.normalizeId("inbox", id);
  const doc = nid ? await db.get(nid) : null;
  return doc && doc.user_id === userId ? doc : null;
}

const pendingOf = (db: R, userId: string) =>
  db.query("inbox").withIndex("by_user_state", (q) => q.eq("user_id", userId).eq("state", "pending")).collect();

// An epic named by a proposer, found if it can be, else none: a suggestion never fails over its epic.
export async function softEpic(db: R, userId: string, names: (string | undefined | null)[]) {
  for (const n of names) {
    if (!n) continue;
    try { return await m.epicByName(db, userId, n); } catch (e) { if (!(e instanceof InputError)) throw e; }
  }
  return null;
}

// One proposal into the inbox. Skipped when it is already a task, or was already settled (accepted, rejected or
// combined); a pending one with the same id is refreshed (Jira moved on). Without an external id, the same title
// as an open task or an earlier suggestion counts as the same thing.
export async function upsertProposal(db: W, userId: string, p: Proposal, origin: string): Promise<"created" | "updated" | "skipped"> {
  const now = Date.now();
  const fields = { ...p, epic_id: p.epic_id as Id<"epics"> | null };
  if (p.external_id) {
    const task = await db.query("tasks").withIndex("by_user_source_ext", (q) =>
      q.eq("user_id", userId).eq("source", p.source).eq("external_id", p.external_id)).first();
    if (task) return "skipped";
    const hit = await db.query("inbox").withIndex("by_user_source_ext", (q) =>
      q.eq("user_id", userId).eq("source", p.source).eq("external_id", p.external_id)).first();
    if (hit) {
      if (hit.state !== "pending") return "skipped";
      const changed = (Object.keys(fields) as (keyof typeof fields)[]).some((k) => JSON.stringify(hit[k] ?? null) !== JSON.stringify(fields[k] ?? null));
      if (!changed) return "skipped";
      await db.patch(hit._id, { ...fields, updated_at: now });
      return "updated";
    }
  } else {
    const t = norm(p.title);
    const open = await db.query("tasks").withIndex("by_user_done", (q) => q.eq("user_id", userId).eq("done", false)).collect();
    const seen = await db.query("inbox").withIndex("by_user_source_ext", (q) => q.eq("user_id", userId)).collect();
    if (open.some((x) => norm(x.title) === t) || seen.some((x) => norm(x.title) === t)) return "skipped";
  }
  await db.insert("inbox", { ...fields, user_id: userId, state: "pending", origin, created_at: now, updated_at: now });
  return "created";
}

async function mine(db: R, userId: string, epicId: string | null) {
  const nid = epicId ? db.normalizeId("epics", epicId) : null;
  const e = nid ? await db.get(nid) : null;
  return e && e.user_id === userId ? e._id : null;
}

// The agent's way in: the same fields as add_tasks, landing in Suggested instead of the list.
export async function propose(db: W, userId: string, inputs: unknown[], t: string) {
  const { rows, skipped, errors } = prepareTasks(inputs, t);
  const proposed: { title: string }[] = [];
  const updated: { title: string }[] = [];
  for (const row of rows) {
    const { epic, index, ...r } = row;
    void index;
    const epic_id = epic ? await softEpic(db, userId, [epic]) : await mine(db, userId, r.epic_id);
    const res = await upsertProposal(db, userId, { ...r, epic_id }, "agent");
    if (res === "created") proposed.push({ title: r.title });
    else if (res === "updated") updated.push({ title: r.title });
    else skipped.push({ title: r.title, source: r.source, external_id: r.external_id ?? "" });
  }
  return { proposed, updated, skipped, errors: errors.sort((a, b) => a.index - b.index) };
}

const asMergeable = (d: Row | Doc<"tasks">): Mergeable => ({
  title: d.title, description: d.description, note: d.note, link: d.link, source: d.source, external_id: d.external_id,
  due: d.due, time: d.time, priority: d.priority, estimate_mins: d.estimate_mins, tags: d.tags,
  epic_id: d.epic_id ?? null, ...(d.checklist ? { checklist: d.checklist } : {}),
});

export async function inboxCount(db: R, userId: string) {
  return (await pendingOf(db, userId)).length;
}

// The Suggested room: each pending suggestion with the open tasks it looks like, and every open task to combine into.
export async function listInbox(db: R, userId: string) {
  const rows = (await pendingOf(db, userId)).sort((a, b) => b.created_at - a.created_at);
  const open = await db.query("tasks").withIndex("by_user_done", (q) => q.eq("user_id", userId).eq("done", false)).collect();
  const tasks = open.map((d) => ({ ...asMergeable(d), id: d._id as string }));
  const epics = await m.listEpics(db, userId);
  return {
    today: m.clock().t,
    epics,
    tasks: tasks.map((x) => ({ id: x.id, title: x.title, due: x.due, epic_id: x.epic_id ?? null })),
    items: rows.map((r) => ({
      id: r._id as string, origin: r.origin, title: r.title, description: r.description, note: r.note, link: r.link,
      source: r.source, external_id: r.external_id, due: r.due, time: r.time, priority: r.priority,
      estimate_mins: r.estimate_mins, tags: r.tags, epic_id: r.epic_id, status: r.status ?? null,
      checklist: r.checklist ?? [], created_at: r.created_at,
      alike: lookalikes(asMergeable(r), tasks),
    })),
  };
}

async function pending(db: R, userId: string, id: string) {
  const row = await owned(db, userId, id);
  if (!row) throw new InputError("suggestion not found");
  if (row.state !== "pending") throw new InputError("already sorted");
  return row;
}

const liveEpic = async (db: R, id: Id<"epics"> | null) => (id && (await db.get(id)) ? id : null);

export async function accept(db: W, userId: string, id: string) {
  const row = await pending(db, userId, id);
  const now = Date.now();
  const task_id = await db.insert("tasks", {
    user_id: userId, title: row.title, description: row.description, note: row.note, link: row.link, source: row.source,
    external_id: row.external_id, due: row.due, time: row.time, priority: row.priority, estimate_mins: row.estimate_mins,
    tags: row.tags, epic_id: await liveEpic(db, row.epic_id), ...(row.status ? { status: row.status } : {}),
    ...(row.checklist?.length ? { checklist: row.checklist } : {}),
    done: false, done_on: null, sort_order: now / 1000, created_at: new Date(now).toISOString(), updated_at: now,
  });
  await db.patch(row._id, { state: "accepted", task_id, updated_at: now });
  return { id, task_id, title: row.title };
}

export async function reject(db: W, userId: string, id: string) {
  const row = await pending(db, userId, id);
  await db.patch(row._id, { state: "rejected", updated_at: Date.now() });
  return { id, title: row.title };
}

// Into an existing task: it keeps what Steve set and takes what it was missing (see mergePatch).
export async function combine(db: W, userId: string, id: string, taskId: string) {
  const row = await pending(db, userId, id);
  const nid = db.normalizeId("tasks", taskId);
  const task = nid ? await db.get(nid) : null;
  if (!task || task.user_id !== userId) throw new InputError("task not found");
  const patch = mergePatch(asMergeable(task), { ...asMergeable(row), epic_id: await liveEpic(db, row.epic_id) });
  const before = Object.fromEntries(Object.keys(patch).map((k) => [k, (task as Record<string, unknown>)[k] ?? null]));
  const now = Date.now();
  if (Object.keys(patch).length) await db.patch(task._id, { ...(patch as Partial<Doc<"tasks">>), updated_at: now });
  await db.patch(row._id, { state: "merged", task_id: task._id, undo: before, updated_at: now });
  return { id, task_id: task._id, title: task.title, changed: Object.keys(patch) };
}

// Back to pending: an accepted suggestion's task goes, a combined one's task gets its old fields back.
export async function undo(db: W, userId: string, id: string) {
  const row = await owned(db, userId, id);
  if (!row) throw new InputError("suggestion not found");
  if (row.state === "pending") return { id };
  if (row.state === "accepted" && row.task_id && (await db.get(row.task_id))) await m.deleteTask(db, userId, row.task_id);
  if (row.state === "merged" && row.task_id && row.undo && (await db.get(row.task_id))) {
    await db.patch(row.task_id, { ...(row.undo as Partial<Doc<"tasks">>), updated_at: Date.now() });
  }
  await db.patch(row._id, { state: "pending", task_id: undefined, undo: undefined, updated_at: Date.now() });
  return { id };
}

const wrap = <T>(p: Promise<T>) => p.catch(m.asConvexError);

export const list = query({ args: {}, handler: async (ctx) => listInbox(ctx.db, await requireUser(ctx)) });
export const count = query({ args: {}, handler: async (ctx) => inboxCount(ctx.db, await requireUser(ctx)) });
export const proposeTasks = mutation({
  args: { tasks: v.array(v.any()) },
  handler: async (ctx, a) => {
    if (a.tasks.length > 100) throw new ConvexError({ code: "input", message: "max 100 tasks per call" });
    return propose(ctx.db, await requireUser(ctx), a.tasks, m.clock().t);
  },
});
export const acceptOne = mutation({ args: { id: v.string() }, handler: async (ctx, a) => wrap(accept(ctx.db, await requireUser(ctx), a.id)) });
export const rejectOne = mutation({ args: { id: v.string() }, handler: async (ctx, a) => wrap(reject(ctx.db, await requireUser(ctx), a.id)) });
export const combineOne = mutation({
  args: { id: v.string(), task_id: v.string() },
  handler: async (ctx, a) => wrap(combine(ctx.db, await requireUser(ctx), a.id, a.task_id)),
});
export const undoOne = mutation({ args: { id: v.string() }, handler: async (ctx, a) => wrap(undo(ctx.db, await requireUser(ctx), a.id)) });
