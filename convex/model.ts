import { ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { addDays, autoPlan, busySpans, firstFree, nowMin, snapUp, suggestions, toHM, toMin, today } from "../shared/planning.ts";
import { buildSnapshot, type FullTask, type State } from "../shared/snapshot.ts";
import { type AddResult, InputError, parseDay, preparePatch, prepareTasks } from "../shared/validation.ts";

type R = QueryCtx["db"];
type W = MutationCtx["db"];
const HISTORY_DAYS = 90; // ponytail: effort/suggestions look back 90 days; widen if older plans matter

export function checkDate(d?: string) {
  if (d === undefined) return;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || new Date(d + "T00:00:00Z").toJSON()?.slice(0, 10) !== d) {
    throw new ConvexError({ code: "input", message: "date must be YYYY-MM-DD" });
  }
}

export const clock = (now = new Date()) => ({ t: today(now), nowM: nowMin(now) });

// Shared code throws InputError; Convex only forwards ConvexError data to callers.
export function asConvexError(e: unknown): never {
  if (e instanceof InputError) {
    throw new ConvexError({ code: e.message === "task not found" ? "not_found" : "input", message: e.message });
  }
  throw e;
}

const toTask = (d: Doc<"tasks">): FullTask => ({
  id: d._id, title: d.title, due: d.due, time: d.time, priority: d.priority, estimate_mins: d.estimate_mins,
  done: d.done, done_on: d.done_on, sort_order: d.sort_order, source: d.source, external_id: d.external_id,
  tags: d.tags, link: d.link, note: d.note, description: d.description,
});

async function ownedTask(db: R, userId: string, id: string) {
  const nid = db.normalizeId("tasks", id);
  const doc = nid ? await db.get(nid) : null;
  return doc && doc.user_id === userId ? doc : null;
}

export async function loadState(db: R, userId: string, t: string, date: string): Promise<State> {
  const lo = addDays(date < t ? date : t, -1);
  const open = await db.query("tasks").withIndex("by_user_done", (q) => q.eq("user_id", userId).eq("done", false)).collect();
  const done = await db.query("tasks").withIndex("by_user_done_on", (q) => q.eq("user_id", userId).gte("done_on", lo)).collect();
  const days = await db.query("days")
    .withIndex("by_user_date", (q) => q.eq("user_id", userId).gte("date", lo).lte("date", addDays(date, 1))).collect();
  const blocks = await db.query("plan_blocks")
    .withIndex("by_user_date", (q) => q.eq("user_id", userId).gte("date", addDays(t, -HISTORY_DAYS))).collect();
  return {
    tasks: [...open, ...done.filter((d) => d.done)].map(toTask),
    days: days.map((d) => ({ date: d.date, headline: d.headline, events: d.events })),
    blocks: blocks.map((b) => ({ task_id: b.task_id, date: b.date, start: b.start, mins: b.mins })),
  };
}

export async function snapshot(db: R, userId: string, a: { date?: string; query?: string }, now = new Date()) {
  checkDate(a.date);
  const { t, nowM } = clock(now);
  const date = a.date ?? t;
  return {
    app_url: process.env.APP_URL ?? null,
    ...buildSnapshot({ date, today: t, nowM, query: a.query, ...(await loadState(db, userId, t, date)) }),
  };
}

export async function addTasks(db: W, userId: string, inputs: unknown[], t: string): Promise<AddResult> {
  const { rows, skipped, errors } = prepareTasks(inputs, t);
  const created: AddResult["created"] = [];
  const now = Date.now();
  for (const [i, r] of rows.entries()) {
    if (r.external_id) {
      const hit = await db.query("tasks").withIndex("by_user_source_ext", (q) =>
        q.eq("user_id", userId).eq("source", r.source).eq("external_id", r.external_id)).first();
      if (hit) { skipped.push({ title: r.title, source: r.source, external_id: r.external_id }); continue; }
    }
    const id = await db.insert("tasks", {
      ...r, user_id: userId, done: false, done_on: null,
      sort_order: now / 1000 + i / 1000, created_at: new Date(now).toISOString(), updated_at: now,
    });
    created.push({ id, title: r.title, source: r.source, external_id: r.external_id });
  }
  return { created, skipped, errors };
}

export async function updateTask(
  db: W, userId: string, find: { id: string } | { source: string; external_id: string }, patch: unknown, t: string,
) {
  const p = preparePatch(patch, t);
  const doc = "id" in find
    ? await ownedTask(db, userId, find.id)
    : await db.query("tasks").withIndex("by_user_source_ext", (q) =>
        q.eq("user_id", userId).eq("source", find.source).eq("external_id", find.external_id)).first();
  if (!doc) throw new InputError("task not found");
  await db.patch(doc._id, { ...(p as Partial<Doc<"tasks">>), updated_at: Date.now() });
  const d = (await db.get(doc._id))!;
  return { id: d._id, title: d.title, due: d.due, time: d.time, priority: d.priority, done: d.done, done_on: d.done_on, tags: d.tags };
}

export async function setDay(db: W, userId: string, input: unknown) {
  const d = parseDay(input);
  const hit = await db.query("days").withIndex("by_user_date", (q) => q.eq("user_id", userId).eq("date", d.date)).first();
  const headline = d.headline === undefined ? hit?.headline ?? null : d.headline ?? null;
  const events = d.events ?? hit?.events ?? [];
  if (hit) await db.patch(hit._id, { headline, events });
  else await db.insert("days", { user_id: userId, date: d.date, headline, events });
  return { date: d.date, headline, events };
}

export async function deleteTask(db: W, userId: string, id: string) {
  const doc = await ownedTask(db, userId, id);
  if (!doc) throw new InputError("task not found");
  for (const b of await db.query("plan_blocks").withIndex("by_task", (q) => q.eq("task_id", doc._id)).collect()) {
    await db.delete(b._id);
  }
  await db.delete(doc._id);
  return { deleted: id };
}

export async function suggestNext(db: R, userId: string, a: { date?: string; limit?: number }, now = new Date()) {
  checkDate(a.date);
  const { t, nowM } = clock(now);
  const date = a.date ?? t;
  const s = await loadState(db, userId, t, date);
  const events = s.days.find((d) => d.date === date)?.events ?? [];
  const free = date === t ? firstFree(15, snapUp(nowM), busySpans(events, s.blocks, date)) : null;
  return {
    date,
    suggestions: suggestions({ date, today: t, nowM, tasks: s.tasks, blocks: s.blocks, limit: a.limit ?? 5 })
      .map((x) => ({ id: x.task.id, title: x.task.title, reasons: x.reasons, estimate_mins: x.task.estimate_mins })),
    next_free: free == null ? null : toHM(free),
  };
}

export async function planDay(
  db: W, userId: string,
  a: { date?: string; task_ids?: string[]; from?: string; until?: string; commit?: boolean }, now = new Date(),
) {
  checkDate(a.date);
  const { t, nowM } = clock(now);
  const date = a.date ?? t;
  const s = await loadState(db, userId, t, date);
  const r = autoPlan({
    date, today: t, nowM, tasks: s.tasks, blocks: s.blocks,
    events: s.days.find((d) => d.date === date)?.events ?? [],
    from: toMin(a.from) ?? undefined, until: toMin(a.until) ?? undefined, taskIds: a.task_ids,
  });
  if (a.commit) {
    for (const p of r.proposed) {
      const taskId = p.task_id as Id<"tasks">;
      const existing = (await db.query("plan_blocks").withIndex("by_task", (q) => q.eq("task_id", taskId)).collect())
        .find((b) => b.date === date);
      if (existing) await db.patch(existing._id, { start: p.start, mins: p.mins });
      else await db.insert("plan_blocks", { user_id: userId, date, task_id: taskId, start: p.start, mins: p.mins });
    }
  }
  return { date, committed: !!a.commit && r.proposed.length > 0, ...r };
}

export async function unplan(db: W, userId: string, date: string, taskIds?: string[]) {
  checkDate(date);
  if (taskIds && !taskIds.length) return { removed: 0 };
  const blocks = await db.query("plan_blocks").withIndex("by_user_date", (q) => q.eq("user_id", userId).eq("date", date)).collect();
  const doomed = taskIds ? blocks.filter((b) => taskIds.includes(b.task_id)) : blocks;
  for (const b of doomed) await db.delete(b._id);
  return { removed: doomed.length };
}

export async function listBySource(db: R, userId: string, source: string | null) {
  const all = source
    ? await db.query("tasks").withIndex("by_user_source_ext", (q) => q.eq("user_id", userId).eq("source", source)).take(500)
    : [
        ...(await db.query("tasks").withIndex("by_user_done", (q) => q.eq("user_id", userId).eq("done", false)).collect()),
        ...(await db.query("tasks").withIndex("by_user_done", (q) => q.eq("user_id", userId).eq("done", true)).order("desc").take(200)),
      ];
  return all.slice(0, 500).map((d) => ({
    id: d._id, title: d.title, source: d.source, external_id: d.external_id, due: d.due, time: d.time,
    priority: d.priority, done: d.done, done_on: d.done_on, tags: d.tags, link: d.link,
  }));
}
