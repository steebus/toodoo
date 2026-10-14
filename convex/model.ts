import { ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { addDays, autoPlan, busySpans, effortMap, firstFree, nowMin, SLOT, SNAP, snapUp, suggestions, toHM, toMin, today } from "../shared/planning.ts";
import { byEpicRank, epicWords, nextColour, type Epic, type EpicColour } from "../shared/epics.ts";
import { buildSnapshot, type FullTask, type State } from "../shared/snapshot.ts";
import {
  type AddResult, InputError, parseDay, parseEpic, parseEpicPatch, preparePatch, prepareTasks,
} from "../shared/validation.ts";

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
    throw new ConvexError({ code: / not found$/.test(e.message) ? "not_found" : "input", message: e.message });
  }
  throw e;
}

const toTask = (d: Doc<"tasks">): FullTask => ({
  id: d._id, title: d.title, due: d.due, time: d.time, priority: d.priority, estimate_mins: d.estimate_mins,
  done: d.done, done_on: d.done_on, sort_order: d.sort_order, source: d.source, external_id: d.external_id,
  tags: d.tags, link: d.link, note: d.note, description: d.description,
  epic_id: d.epic_id ?? null, status: d.status ?? "todo", ...(d.checklist?.length ? { checklist: d.checklist } : {}),
});

const toEpic = (d: Doc<"epics">): Epic => ({
  id: d._id, title: d.title, description: d.description, priority: d.priority, status: d.status, sort_order: d.sort_order,
  colour: (d.colour ?? null) as EpicColour | null,
});

async function ownedEpic(db: R, userId: string, id: string) {
  const nid = db.normalizeId("epics", id);
  const doc = nid ? await db.get(nid) : null;
  return doc && doc.user_id === userId ? doc : null;
}

// An epic_id from a caller: null stays null; anything else must be one of this user's epics.
async function epicRef(db: R, userId: string, id: string | null) {
  if (id === null) return null;
  const doc = await ownedEpic(db, userId, id);
  if (!doc) throw new InputError("epic not found");
  return doc._id;
}

// An epic by name: the open epic with that exact title (any case), else the one it starts, else the one whose
// words it names. Unknown names are an error that lists the epics there are, so the caller can correct itself.
export async function epicByName(db: R, userId: string, name: string) {
  const all = (await listEpics(db, userId)).filter((e) => e.status !== "done");
  const q = name.trim().toLowerCase();
  const hit = all.find((e) => e.title.toLowerCase() === q)
    ?? all.find((e) => e.title.toLowerCase().startsWith(q))
    ?? all.find((e) => epicWords(e.title).some((w) => epicWords(q).includes(w)));
  if (!hit) {
    throw new InputError(`epic not found: ${name} (open epics: ${all.map((e) => e.title).join(", ") || "none"})`);
  }
  return hit.id as Id<"epics">;
}

export async function listEpics(db: R, userId: string): Promise<Epic[]> {
  return (await db.query("epics").withIndex("by_user", (q) => q.eq("user_id", userId)).collect()).map(toEpic).sort(byEpicRank);
}

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
    blocks: blocks.map((b) => ({ id: b._id, task_id: b.task_id, date: b.date, start: b.start, mins: b.mins })),
    epics: await listEpics(db, userId),
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
  for (const [i, { index, epic: epicName, ...r }] of rows.entries()) {
    let epic_id: Id<"epics"> | null;
    try { epic_id = epicName ? await epicByName(db, userId, epicName) : await epicRef(db, userId, r.epic_id); } catch (e) {
      if (!(e instanceof InputError)) throw e;
      errors.push({ index, error: e.message });
      continue;
    }
    if (r.external_id) {
      const hit = await db.query("tasks").withIndex("by_user_source_ext", (q) =>
        q.eq("user_id", userId).eq("source", r.source).eq("external_id", r.external_id)).first();
      if (hit) { skipped.push({ title: r.title, source: r.source, external_id: r.external_id }); continue; }
    }
    const id = await db.insert("tasks", {
      ...r, epic_id, user_id: userId, done: false, done_on: null,
      sort_order: now / 1000 + i / 1000, created_at: new Date(now).toISOString(), updated_at: now,
    });
    created.push({ id, title: r.title, source: r.source, external_id: r.external_id });
  }
  return { created, skipped, errors: errors.sort((a, b) => a.index - b.index) };
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
  if (typeof p.epic === "string") {
    if (p.epic_id === undefined) p.epic_id = await epicByName(db, userId, p.epic);
    delete p.epic;
  }
  if (p.epic_id !== undefined) p.epic_id = await epicRef(db, userId, p.epic_id as string | null);
  await db.patch(doc._id, { ...(p as Partial<Doc<"tasks">>), updated_at: Date.now() });
  const d = (await db.get(doc._id))!;
  return {
    id: d._id, title: d.title, due: d.due, time: d.time, priority: d.priority, done: d.done, done_on: d.done_on, tags: d.tags,
    epic_id: d.epic_id ?? null, status: d.status ?? "todo", checklist: d.checklist ?? [],
  };
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
  const free = date === t ? firstFree(SLOT, snapUp(nowM), busySpans(events, s.blocks, date)) : null;
  return {
    date,
    suggestions: suggestions({ date, today: t, nowM, tasks: s.tasks, blocks: s.blocks, epics: s.epics, limit: a.limit ?? 5 })
      .map((x) => ({ id: x.task.id, title: x.task.title, reasons: x.reasons, estimate_mins: x.task.estimate_mins })),
    next_free: free == null ? null : toHM(free),
  };
}

export async function planDay(
  db: W, userId: string,
  a: { date?: string; task_ids?: string[]; from?: string; until?: string; mins?: number; commit?: boolean }, now = new Date(),
) {
  checkDate(a.date);
  const { t, nowM } = clock(now);
  const date = a.date ?? t;
  const s = await loadState(db, userId, t, date);
  const r = autoPlan({
    date, today: t, nowM, tasks: s.tasks, blocks: s.blocks, epics: s.epics,
    events: s.days.find((d) => d.date === date)?.events ?? [],
    from: toMin(a.from) ?? undefined, until: toMin(a.until) ?? undefined, taskIds: a.task_ids, mins: a.mins,
  });
  // Committed: each proposal is a new block (a task already on the line gets another), and says its id.
  const proposed = [];
  for (const p of r.proposed) {
    const id = a.commit
      ? await db.insert("plan_blocks", { user_id: userId, date, task_id: p.task_id as Id<"tasks">, start: p.start, mins: p.mins })
      : undefined;
    proposed.push(id ? { id, ...p } : p);
  }
  return { date, committed: !!a.commit && r.proposed.length > 0, proposed, unplaced: r.unplaced };
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

export async function board(db: R, userId: string, a: { date?: string }, now: Date) {
  checkDate(a.date);
  const { t, nowM } = clock(now);
  const date = a.date ?? t;
  const s = await loadState(db, userId, t, date);
  const planned = new Set(s.blocks.filter((b) => b.date === date).map((b) => b.task_id));
  const have = new Set(s.tasks.map((x) => x.id));
  const extra: FullTask[] = [];
  for (const id of planned) {
    if (have.has(id)) continue;
    const d = await db.get(id as Id<"tasks">);
    if (d && d.user_id === userId) extra.push(toTask(d));
  }
  return {
    today: t, date, nowM, app_url: process.env.APP_URL ?? null,
    day: s.days.find((d) => d.date === date) ?? null,
    tasks: [...s.tasks, ...extra],
    blocks: s.blocks.filter((b) => b.date >= addDays(date, -1) && b.date <= addDays(date, 1)),
    epics: s.epics ?? [],
    // Time planned and spent so far on each open task with an estimate, from every block kept (not just these days).
    effort: Object.fromEntries([...effortMap(s.blocks, t, nowM)]
      .filter(([id]) => s.tasks.some((x) => x.id === id && x.estimate_mins && !x.done))
      .map(([id, e]) => [id, { planned: e.planned, actual: e.actual }])),
    suggestions: suggestions({ date, today: t, nowM, tasks: s.tasks, blocks: s.blocks, epics: s.epics })
      .map((x) => ({ id: x.task.id, title: x.task.title, reasons: x.reasons })),
  };
}

const snap = (m: number) => Math.round(m / SNAP) * SNAP;

// A block on the line: block_id moves or resizes that one; without it, the task gets a new block that day (it may
// already have others). The time snaps to 5 minutes (5 at least) and stays inside the day.
export async function placeBlock(
  db: W, userId: string, a: { task_id: string; date: string; start: string; mins: number; block_id?: string },
) {
  checkDate(a.date);
  const task = await ownedTask(db, userId, a.task_id);
  if (!task) throw new InputError("task not found");
  const s = Math.min(24 * 60 - SNAP, Math.max(0, snap(toMin(a.start) ?? 0)));
  const mins = Math.max(SNAP, Math.min(1440, snap(a.mins), 24 * 60 - s));
  const row = { start: toHM(s), mins };
  if (a.block_id) {
    const nid = db.normalizeId("plan_blocks", a.block_id);
    const block = nid ? await db.get(nid) : null;
    if (!block || block.user_id !== userId || block.task_id !== task._id) throw new InputError("block not found");
    await db.patch(block._id, { ...row, date: a.date });
    return { id: block._id, task_id: task._id, date: a.date, ...row };
  }
  const id = await db.insert("plan_blocks", { user_id: userId, date: a.date, task_id: task._id, ...row });
  return { id, task_id: task._id, date: a.date, ...row };
}

// One block (block_id), or all of a task's blocks that day. Quietly a no-op for a gone or foreign task or block:
// an undo whose task was deleted elsewhere must not stop partway.
export async function removeBlock(db: W, userId: string, a: { task_id: string; date: string; block_id?: string }) {
  if (!a.block_id) return unplan(db, userId, a.date, [a.task_id]);
  const nid = db.normalizeId("plan_blocks", a.block_id);
  const block = nid ? await db.get(nid) : null;
  if (!block || block.user_id !== userId) return { removed: 0 };
  await db.delete(block._id);
  return { removed: 1 };
}

// ---------- epics ----------

export async function createEpic(db: W, userId: string, input: unknown) {
  const e = parseEpic(input);
  const now = Date.now();
  const colour = e.colour ?? nextColour(await listEpics(db, userId));
  const id = await db.insert("epics", {
    ...e, colour, user_id: userId, sort_order: now / 1000, created_at: new Date(now).toISOString(), updated_at: now,
  });
  return toEpic((await db.get(id))!);
}

export async function updateEpic(db: W, userId: string, id: string, patch: unknown) {
  const p = parseEpicPatch(patch);
  const doc = await ownedEpic(db, userId, id);
  if (!doc) throw new InputError("epic not found");
  await db.patch(doc._id, { ...p, updated_at: Date.now() });
  return toEpic((await db.get(doc._id))!);
}

// The epic goes; its tasks stay, with no epic. The ids come back so an undo can put them back in.
export async function deleteEpic(db: W, userId: string, id: string) {
  const doc = await ownedEpic(db, userId, id);
  if (!doc) throw new InputError("epic not found");
  const tasks = await db.query("tasks").withIndex("by_user_epic", (q) => q.eq("user_id", userId).eq("epic_id", doc._id)).collect();
  for (const t of tasks) await db.patch(t._id, { epic_id: null, updated_at: Date.now() });
  await db.delete(doc._id);
  return { deleted: id, task_ids: tasks.map((t) => t._id as string) };
}

const RECENT_DONE_DAYS = 14;

// What the Kanban and Epics screens work from: every open task, the last fortnight's done, and the epics.
export async function workspace(db: R, userId: string, now: Date) {
  const { t, nowM } = clock(now);
  const open = await db.query("tasks").withIndex("by_user_done", (q) => q.eq("user_id", userId).eq("done", false)).collect();
  const done = await db.query("tasks")
    .withIndex("by_user_done_on", (q) => q.eq("user_id", userId).gte("done_on", addDays(t, -RECENT_DONE_DAYS))).collect();
  const epics = await listEpics(db, userId);
  // Progress counts every task ever done in an epic, not just the fortnight listed.
  const doneCounts: Record<string, number> = {};
  for (const e of epics) {
    const all = await db.query("tasks")
      .withIndex("by_user_epic", (q) => q.eq("user_id", userId).eq("epic_id", e.id as Id<"epics">)).collect();
    doneCounts[e.id] = all.filter((x) => x.done).length;
  }
  // Minutes already spent (planned blocks gone by) on each open task with an estimate: the Matrix sizes by what's left.
  const blocks = await db.query("plan_blocks")
    .withIndex("by_user_date", (q) => q.eq("user_id", userId).gte("date", addDays(t, -HISTORY_DAYS))).collect();
  const estimated = new Set(open.filter((x) => x.estimate_mins).map((x) => x._id as string));
  const spent = Object.fromEntries([...effortMap(blocks.map((b) => ({ ...b, id: b._id, task_id: b.task_id as string })), t, nowM)]
    .filter(([id, e]) => estimated.has(id) && e.actual > 0).map(([id, e]) => [id, e.actual]));
  return {
    today: t,
    epics,
    done_counts: doneCounts,
    tasks: [...open, ...done.filter((d) => d.done)].map(toTask),
    spent,
  };
}
