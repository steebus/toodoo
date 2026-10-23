import { ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { StorageWriter } from "convex/server";
import { addDays, autoPlan, mergeRuns, busySpans, effortMap, fillDay, firstFree, nowMin, SLOT, SNAP, snapUp, suggestions, toHM, toMin, today, ymd } from "../shared/planning.ts";
import { byEpicRank, epicWords, nextColour, type Epic, type EpicColour } from "../shared/epics.ts";
import { assignedToClaude, CLAUDE_TAG, type Assignee, type ClaudeStatus } from "../shared/assign.ts";
import { prepFor } from "../shared/inbox.ts";
import { piles, QUIET_DAYS, tidyCount } from "../shared/tidy.ts";
import { buildSnapshot, WEEK_AHEAD, type FullTask, type State } from "../shared/snapshot.ts";
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

export const toTask = (d: Doc<"tasks">): FullTask => ({
  id: d._id, title: d.title, due: d.due, time: d.time, priority: d.priority, estimate_mins: d.estimate_mins,
  done: d.done, done_on: d.done_on, sort_order: d.sort_order, source: d.source, external_id: d.external_id,
  tags: d.tags, link: d.link, note: d.note, description: d.description,
  epic_id: d.epic_id ?? null, status: d.status ?? "todo", ...(d.checklist?.length ? { checklist: d.checklist } : {}),
  ...(d.assignee ? { assignee: d.assignee } : {}), ...(d.claude_status ? { claude_status: d.claude_status } : {}),
  ...(d.prep_for ? { prep_for: d.prep_for } : {}), ...(d.attachments ? { attachments: d.attachments } : {}),
});

const toEpic = (d: Doc<"epics">): Epic => ({
  id: d._id, title: d.title, description: d.description, priority: d.priority, status: d.status, sort_order: d.sort_order,
  colour: (d.colour ?? null) as EpicColour | null, repo: d.repo ?? null,
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

export async function ownedTask(db: R, userId: string, id: string) {
  const nid = db.normalizeId("tasks", id);
  const doc = nid ? await db.get(nid) : null;
  return doc && doc.user_id === userId ? doc : null;
}

export async function loadState(db: R, userId: string, t: string, date: string): Promise<State> {
  const lo = addDays(date < t ? date : t, -1);
  const open = await db.query("tasks").withIndex("by_user_done", (q) => q.eq("user_id", userId).eq("done", false)).collect();
  const done = await db.query("tasks").withIndex("by_user_done_on", (q) => q.eq("user_id", userId).gte("done_on", lo)).collect();
  const days = await db.query("days")
    .withIndex("by_user_date", (q) => q.eq("user_id", userId).gte("date", lo).lte("date", addDays(date, 1 + WEEK_AHEAD))).collect();
  const blocks = await db.query("plan_blocks")
    .withIndex("by_user_date", (q) => q.eq("user_id", userId).gte("date", addDays(t, -HISTORY_DAYS))).collect();
  const paint = await colourEvents(db, userId);
  return {
    tasks: [...open, ...done.filter((d) => d.done)].map(toTask),
    days: days.map((d) => ({ date: d.date, headline: d.headline, events: paint(d.events) })),
    blocks: blocks.map((b) => ({ id: b._id, task_id: b.task_id, date: b.date, start: b.start, mins: b.mins })),
    epics: await listEpics(db, userId),
  };
}

const JIRA_STALE_MS = 2 * 60 * 60_000; // the cron syncs every 15 minutes; two hours without one is broken
// The Jira link as the morning run needs it: `linked` only while it's actually syncing, so a broken link (bad
// token, bad JQL, stalled) sends the run back to gathering Jira itself, and `error` says why.
async function jiraState(db: R, userId: string, now: number) {
  const l = await db.query("jira_links").withIndex("by_user", (q) => q.eq("user_id", userId)).first();
  if (!l) return { linked: false, error: null };
  const stale = l.synced_at && now - l.synced_at > JIRA_STALE_MS ? `no sync for ${Math.round((now - l.synced_at) / 3_600_000)}h` : null;
  const error = l.error ?? stale;
  return { linked: !error, error };
}
// What waits in Suggested, in all and by the source's pile (jira, agent, …).
async function inboxWaiting(db: R, userId: string) {
  const rows = await db.query("inbox").withIndex("by_user_state", (q) => q.eq("user_id", userId).eq("state", "pending")).collect();
  const by: Record<string, number> = {};
  for (const r of rows) by[r.origin] = (by[r.origin] ?? 0) + 1;
  return { n: rows.length, by };
}

// Events as they go out: each synced one takes its calendar's colour (graphite, the plain look, carries none), and
// the feed id it was tagged with stays in the database.
export async function colourEvents(db: R, userId: string) {
  const feeds = await db.query("calendar_feeds").withIndex("by_user", (q) => q.eq("user_id", userId)).collect();
  const colours = new Map(feeds.map((f) => [f._id as string, f.colour]));
  return <E extends { feed?: string }>(events: E[]) => events.map(({ feed, ...e }) => {
    const colour = feed ? colours.get(feed) : undefined;
    return colour && colour !== "graphite" ? { ...e, colour } : e;
  });
}

const hasFeed = async (db: R, userId: string) =>
  (await db.query("calendar_feeds").withIndex("by_user", (q) => q.eq("user_id", userId)).first()) !== null;

export async function snapshot(db: R, userId: string, a: { date?: string; query?: string }, now = new Date()) {
  checkDate(a.date);
  const { t, nowM } = clock(now);
  const date = a.date ?? t;
  return {
    app_url: process.env.APP_URL ?? null,
    calendar_feed: await hasFeed(db, userId),
    ...(await jiraState(db, userId, now.getTime()).then((j) => ({ jira_link: j.linked, jira_error: j.error }))),
    ...(await inboxWaiting(db, userId).then((w) => ({ suggested_waiting: w.n, suggested_by_source: w.by }))),
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
      if (hit) { skipped.push({ title: r.title, source: r.source, external_id: r.external_id, id: hit._id }); continue; }
    }
    const claude = r.assignee === "claude";
    const id = await db.insert("tasks", {
      ...r, ...(claude ? { tags: withClaudeTag(r.tags), claude_status: r.claude_status ?? "todo" } : {}), epic_id, user_id: userId, done: false, done_on: null,
      sort_order: now / 1000 + i / 1000, created_at: new Date(now).toISOString(), updated_at: now,
    });
    created.push({ id, title: r.title, source: r.source, external_id: r.external_id });
  }
  return { created, skipped, errors: errors.sort((a, b) => a.index - b.index) };
}

// Assigning to Claude keeps the #claude tag on, so the scan by tag still finds it. Nothing ever removes the tag.
const withClaudeTag = (tags: string[]) => (tags.includes(CLAUDE_TAG) ? tags : [...tags, CLAUDE_TAG]);

// `byAgent`: the call came over MCP. Claude finishing a task it is assigned (done: true) hands it to Steve in Review
// rather than closing it; Steve ticks it off after looking.
export async function updateTask(
  db: W, userId: string, find: { id: string } | { source: string; external_id: string }, patch: unknown, t: string,
  byAgent = false,
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
  if (byAgent && p.done === true && doc.assignee === "claude" && p.claude_status === undefined) {
    delete p.done; delete p.done_on;
    p.claude_status = "review";
    p.assignee = "steve";
  }
  const nowClaude = (p.assignee as Assignee | undefined) === "claude";
  if (nowClaude) {
    p.tags = withClaudeTag((p.tags as string[] | undefined) ?? doc.tags);
    if (p.claude_status === undefined && (!doc.claude_status || doc.claude_status === "review" || doc.claude_status === "done")) p.claude_status = "todo";
    if (p.done === undefined && doc.done && p.claude_status !== "done") { p.done = false; p.done_on = null; }
  }
  const cs = p.claude_status as ClaudeStatus | undefined;
  // Claude's Done is the task's own done flag; leaving Done reopens it.
  if (cs === "done" && p.done === undefined) { p.done = true; p.done_on = t; }
  else if (cs && cs !== "done" && p.done === undefined && doc.done) { p.done = false; p.done_on = null; }
  // Into Claude's To do, Doing or Escalated hands it to Claude; into Review hands it to Steve.
  if (cs && p.assignee === undefined) {
    if (cs === "review") p.assignee = "steve";
    else if (cs !== "done") { p.assignee = "claude"; p.tags = withClaudeTag((p.tags as string[] | undefined) ?? doc.tags); }
  }
  if (p.tags && doc.tags.includes(CLAUDE_TAG)) p.tags = withClaudeTag(p.tags as string[]);
  if (p.claude_status === null) p.claude_status = undefined; // undefined unsets the field
  await db.patch(doc._id, { ...(p as Partial<Doc<"tasks">>), updated_at: Date.now() });
  const d = (await db.get(doc._id))!;
  return {
    id: d._id, title: d.title, due: d.due, time: d.time, priority: d.priority, done: d.done, done_on: d.done_on, tags: d.tags,
    epic_id: d.epic_id ?? null, status: d.status ?? "todo", checklist: d.checklist ?? [], prep_for: d.prep_for ?? null,
    assignee: assignedToClaude(d) ? "claude" : "steve", claude_status: d.claude_status ?? null,
    ...(byAgent && doc.assignee === "claude" && d.assignee === "steve" && d.claude_status === "review" && !d.done ? { moved_to_review: true } : {}),
  };
}

export async function setDay(db: W, userId: string, input: unknown) {
  const d = parseDay(input);
  const hit = await db.query("days").withIndex("by_user_date", (q) => q.eq("user_id", userId).eq("date", d.date)).first();
  const headline = d.headline === undefined ? hit?.headline ?? null : d.headline ?? null;
  // A user with a calendar feed gets events from it alone; set_day keeps to the headline.
  const events = ((await hasFeed(db, userId)) ? undefined : d.events) ?? hit?.events ?? [];
  if (hit) await db.patch(hit._id, { headline, events });
  else await db.insert("days", { user_id: userId, date: d.date, headline, events });
  return { date: d.date, headline, events: events.map((e) => { const { feed: _, ...rest } = e as typeof e & { feed?: string }; return rest; }) };
}

// A prep task for a calendar event, made once: a second ask finds the first.
export async function prepTask(db: W, userId: string, e: { date: string; start?: string; end?: string; title: string; where?: string }) {
  checkDate(e.date);
  const { prep_for, ...p } = prepFor(e);
  const hit = await db.query("tasks").withIndex("by_user_source_ext", (q) =>
    q.eq("user_id", userId).eq("source", p.source).eq("external_id", p.external_id)).first();
  if (hit) {
    if (!hit.prep_for) await db.patch(hit._id, { prep_for, updated_at: Date.now() }); // made before tasks knew their meeting
    return { id: hit._id as string, title: hit.title, created: false };
  }
  const r = await addTasks(db, userId, [p], e.date);
  if (!r.created[0]) throw new InputError(r.errors[0]?.error ?? "couldn't make that");
  await db.patch(r.created[0].id as Id<"tasks">, { prep_for });
  return { id: r.created[0].id, title: r.created[0].title, created: true };
}

// The meetings ahead (today and the week after), for linking a task to one as its prep.
export async function meetings(db: R, userId: string, now = new Date()) {
  const { t } = clock(now);
  const days = await db.query("days")
    .withIndex("by_user_date", (q) => q.eq("user_id", userId).gte("date", t).lte("date", addDays(t, 7))).collect();
  return days.sort((a, b) => a.date.localeCompare(b.date)).flatMap((d) => d.events
    .filter((e) => !e.allDay && e.start)
    .map((e) => ({ date: d.date, start: e.start!, end: e.end ?? null, title: e.title, where: e.where ?? null })));
}

// Every planner block a task has had, on any day (the activity log on its ticket); nothing for a task that isn't the user's.
export async function taskBlocks(db: R, userId: string, id: string) {
  const doc = await ownedTask(db, userId, id);
  if (!doc) return [];
  const blocks = await db.query("plan_blocks").withIndex("by_task", (q) => q.eq("task_id", doc._id)).collect();
  return blocks.map((b) => ({ id: b._id as string, date: b.date, start: b.start, mins: b.mins }));
}

export async function deleteTask(db: W, userId: string, id: string, storage: StorageWriter) {
  const doc = await ownedTask(db, userId, id);
  if (!doc) throw new InputError("task not found");
  for (const b of await db.query("plan_blocks").withIndex("by_task", (q) => q.eq("task_id", doc._id)).collect()) {
    await db.delete(b._id);
  }
  for (const a of await db.query("attachments").withIndex("by_task", (q) => q.eq("task_id", doc._id)).collect()) {
    await storage.delete(a.storage_id);
    await db.delete(a._id);
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
  if (a.commit && proposed.length) await mergeBlocks(db, userId, date);
  return { date, committed: !!a.commit && r.proposed.length > 0, proposed, unplaced: r.unplaced };
}

// What auto plan is asked: the window, keep, the day's breathing room (a buffer after meetings, lunch on or off),
// slack from history, and a Shuffle seed.
export type FillAsk = {
  date?: string; from?: string; until?: string; keep?: boolean; buffer?: number; lunch?: boolean; slack?: boolean; seed?: number;
};
const LUNCH = { s: 12 * 60, e: 13 * 60 };

// Auto plan: fill a day's window (see fillDay). Proposes only; with commit, takes off the blocks it replaces (when
// not keeping them) and saves the new ones, each with its id.
export async function fillPlan(db: W, userId: string, a: FillAsk & { commit?: boolean }, now = new Date()) {
  checkDate(a.date);
  const { t, nowM } = clock(now);
  const date = a.date ?? t;
  const s = await loadState(db, userId, t, date);
  const r = fillDay({ ...(await fillInput(db, userId, s, t, nowM, date, a)) });
  if (!a.commit) return { ...r, committed: false };
  await dropBlocks(db, userId, date, r.replaced);
  const proposed = await saveBlocks(db, userId, date, r.proposed);
  return { ...r, proposed, committed: proposed.length > 0 || r.replaced.length > 0 };
}

// Replan from now: today's blocks that have passed with their task unticked come off; the rest of today fills again
// (they're back in the running), and whichever of them doesn't fit goes onto tomorrow.
export async function replan(db: W, userId: string, a: FillAsk & { commit?: boolean }, now = new Date()) {
  const { t, nowM } = clock(now);
  const s = await loadState(db, userId, t, t);
  const done = new Set(s.tasks.filter((x) => x.done).map((x) => x.id));
  const missed = s.blocks.filter((b) => b.date === t && (toMin(b.start) ?? 0) + b.mins <= nowM && !done.has(b.task_id));
  const left = { ...s, blocks: s.blocks.filter((b) => !missed.includes(b)) };
  const today = fillDay({ ...(await fillInput(db, userId, left, t, nowM, t, { ...a, keep: true })) });
  const placed = new Set(today.proposed.map((p) => p.task_id));
  const carry = [...new Set(missed.map((b) => b.task_id))].filter((id) => !placed.has(id));
  const tomorrowDate = addDays(t, 1);
  const tomorrow = carry.length
    ? fillDay({ ...(await fillInput(db, userId, left, t, nowM, tomorrowDate, { ...a, keep: true })), only: carry })
    : null;
  const removed = missed.map((b) => ({ task_id: b.task_id, start: b.start, mins: b.mins }));
  if (!a.commit) return { ...today, removed, tomorrow: (tomorrow?.proposed ?? []).map((p) => ({ ...p, date: tomorrowDate })), committed: false };
  await dropBlocks(db, userId, t, removed);
  const proposed = await saveBlocks(db, userId, t, today.proposed);
  const later = tomorrow ? await saveBlocks(db, userId, tomorrowDate, tomorrow.proposed) : [];
  return { ...today, proposed, removed, tomorrow: later.map((p) => ({ ...p, date: tomorrowDate })), committed: true };
}

async function fillInput(db: R, userId: string, s: State, t: string, nowM: number, date: string, a: FillAsk) {
  // Tasks ticked in the last four weeks: how much of a plan gets done, and how long untimed work really takes.
  const done = (await db.query("tasks").withIndex("by_user_done_on", (q) => q.eq("user_id", userId).gte("done_on", addDays(t, -28))).collect())
    .filter((d) => d.done).map((d) => ({ id: d._id as string, done_on: d.done_on, epic_id: d.epic_id ?? null, tags: d.tags, source: d.source }));
  return {
    date, today: t, nowM, tasks: s.tasks, blocks: s.blocks, epics: s.epics, done,
    events: s.days.find((d) => d.date === date)?.events ?? [],
    from: toMin(a.from) ?? undefined, until: toMin(a.until) ?? undefined, keep: a.keep,
    buffer: a.buffer, lunch: a.lunch === false ? null : LUNCH, slack: a.slack, seed: a.seed,
  };
}

async function dropBlocks(db: W, userId: string, date: string, gone: { task_id: string; start: string }[]) {
  const keys = new Set(gone.map((b) => `${b.task_id}@${b.start}`));
  if (!keys.size) return;
  for (const b of await db.query("plan_blocks").withIndex("by_user_date", (q) => q.eq("user_id", userId).eq("date", date)).collect()) {
    if (keys.has(`${b.task_id}@${b.start}`)) await db.delete(b._id);
  }
}

async function saveBlocks<T extends { task_id: string; start: string; mins: number }>(db: W, userId: string, date: string, list: T[]) {
  const out: (T & { id: string })[] = [];
  for (const p of list) {
    const id = await db.insert("plan_blocks", { user_id: userId, date, task_id: p.task_id as Id<"tasks">, start: p.start, mins: p.mins });
    out.push({ ...p, id: id as string });
  }
  return out;
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
    // Time planned and spent so far on each task with an estimate (done ones too: their ticket still tallies it), from every block kept (not just these days).
    effort: Object.fromEntries([...effortMap(s.blocks, t, nowM)]
      .filter(([id]) => s.tasks.some((x) => x.id === id && x.estimate_mins))
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
  let lo = s, hi = s + mins;
  // One task never has two plans that overlap or touch in a day: they become the one plan, covering both.
  const same = (await db.query("plan_blocks").withIndex("by_user_date", (q) => q.eq("user_id", userId).eq("date", a.date)).collect())
    .filter((b) => b.task_id === task._id && b._id !== (a.block_id as unknown));
  const joined = same.filter((b) => { const bs = toMin(b.start) ?? 0; return bs <= hi && bs + b.mins >= lo; });
  for (const b of joined) { const bs = toMin(b.start) ?? 0; lo = Math.min(lo, bs); hi = Math.max(hi, bs + b.mins); }
  const row = { start: toHM(lo), mins: hi - lo };
  const nid = a.block_id ? db.normalizeId("plan_blocks", a.block_id) : null;
  const block = nid ? await db.get(nid) : null;
  if (a.block_id && (!block || block.user_id !== userId || block.task_id !== task._id)) throw new InputError("block not found");
  let id;
  if (block) {
    id = block._id;
    await db.patch(id, { ...row, date: a.date });
  } else if (joined.length) {
    id = joined[0]._id;
    await db.patch(id, row);
    joined.shift();
  } else {
    id = await db.insert("plan_blocks", { user_id: userId, date: a.date, task_id: task._id, ...row });
  }
  for (const b of joined) await db.delete(b._id);
  return { id, task_id: task._id, date: a.date, ...row };
}

// Folds a day's overlapping or touching plans of one task into one (the earliest keeps its id), for plans made before
// that was the rule or laid down by auto plan.
export async function mergeBlocks(db: W, userId: string, date: string) {
  checkDate(date);
  const rows = await db.query("plan_blocks").withIndex("by_user_date", (q) => q.eq("user_id", userId).eq("date", date)).collect();
  let merged = 0;
  for (const run of mergeRuns(rows.map((b) => ({ ...b, task_id: b.task_id as string })))) {
    const start = Math.min(...run.map((b) => toMin(b.start) ?? 0));
    const end = Math.max(...run.map((b) => (toMin(b.start) ?? 0) + b.mins));
    await db.patch(run[0]._id, { start: toHM(start), mins: end - start });
    for (const b of run.slice(1)) await db.delete(b._id);
    merged += run.length - 1;
  }
  return { merged };
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

// ---------- the whole account: Stats and All tasks ----------

// Every task ever (with the day it was made), every epic and every block: Stats charts it, All tasks searches it.
// ponytail: one unpaged read of everything; page it (or keep running totals) if an account outgrows a few thousand tasks
// How many open tasks want tidying (quiet, undated or unsized): the count on the wordmark.
export async function tidyCountOf(db: R, userId: string, now: Date) {
  const { t } = clock(now);
  const tasks = await db.query("tasks").withIndex("by_user_done", (q) => q.eq("user_id", userId).eq("done", false)).collect();
  const blocks = await db.query("plan_blocks")
    .withIndex("by_user_date", (q) => q.eq("user_id", userId).gte("date", addDays(t, -QUIET_DAYS))).collect();
  return tidyCount(piles(tasks.map((d) => ({ ...toTask(d), touched_on: ymd(new Date(d.updated_at)) })),
    blocks.map((b) => ({ task_id: b.task_id as string, date: b.date })), t));
}

export async function everything(db: R, userId: string, now: Date) {
  const { t, nowM } = clock(now);
  const tasks = await db.query("tasks").withIndex("by_user_done", (q) => q.eq("user_id", userId)).collect();
  const blocks = await db.query("plan_blocks").withIndex("by_user_date", (q) => q.eq("user_id", userId)).collect();
  const link = await db.query("jira_links").withIndex("by_user", (q) => q.eq("user_id", userId)).first();
  return {
    today: t, nowM,
    jira_open: link?.open_keys ?? null, jira_synced_at: link?.synced_at ?? null,
    epics: await listEpics(db, userId),
    tasks: tasks.map((d) => ({ ...toTask(d), created_on: ymd(new Date(d.created_at)), touched_on: ymd(new Date(d.updated_at)) })),
    blocks: blocks.map((b) => ({ id: b._id as string, task_id: b.task_id as string, date: b.date, start: b.start, mins: b.mins })),
  };
}
