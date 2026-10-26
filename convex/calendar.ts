import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { requireUser } from "./lib/user";
import { addDays, daysBetween, today } from "../shared/planning.ts";
import { feedHash, isCalColour, MAX_FEED_BYTES, nextCalColour } from "../shared/calendars.ts";
import { checkDate, colourEvents } from "./model";

const MAX_FEEDS = 5;

// What a feed is called on screen: the calendar's id for Google (an address, not the secret), else the host.
export function feedLabel(url: string) {
  const u = new URL(url);
  const g = /\/calendar\/ical\/([^/]+)\//.exec(u.pathname);
  return g ? decodeURIComponent(g[1]) : u.host;
}

export function normFeedUrl(raw: string) {
  const s = raw.trim().replace(/^webcal:\/\//i, "https://");
  let u: URL;
  try { u = new URL(s); } catch { throw new ConvexError({ code: "input", message: "not a web address" }); }
  if (u.protocol !== "https:" || s.length > 2000) throw new ConvexError({ code: "input", message: "needs an https address" });
  return u.toString();
}

export const feeds = query({
  args: {},
  handler: async (ctx) => {
    const user_id = await requireUser(ctx);
    const rows = await ctx.db.query("calendar_feeds").withIndex("by_user", (q) => q.eq("user_id", user_id)).collect();
    return rows.map((r) => ({
      id: r._id, label: feedLabel(r.url), colour: isCalColour(r.colour) ? r.colour : "graphite", synced_at: r.synced_at ?? null, tried_at: r.tried_at ?? null, error: r.error ?? null,
    }));
  },
});

export const addFeed = mutation({
  args: { url: v.string() },
  handler: async (ctx, a) => {
    const user_id = await requireUser(ctx);
    const url = normFeedUrl(a.url);
    const rows = await ctx.db.query("calendar_feeds").withIndex("by_user", (q) => q.eq("user_id", user_id)).collect();
    if (rows.some((r) => r.url === url)) return;
    if (rows.length >= MAX_FEEDS) throw new ConvexError({ code: "input", message: `${MAX_FEEDS} calendars at most` });
    await ctx.db.insert("calendar_feeds", { user_id, url, colour: nextCalColour(rows.map((r) => r.colour)) });
    await ctx.scheduler.runAfter(0, internal.calendarSync.syncUser, { user_id });
  },
});

export const removeFeed = mutation({
  args: { id: v.id("calendar_feeds") },
  handler: async (ctx, a) => {
    const user_id = await requireUser(ctx);
    const row = await ctx.db.get(a.id);
    if (!row || row.user_id !== user_id) return;
    await ctx.db.delete(a.id);
    await ctx.scheduler.runAfter(0, internal.calendarSync.syncUser, { user_id });
  },
});

// A calendar's colour: its events on the line and the month take it at once (they're coloured on the way out).
export const setColour = mutation({
  args: { id: v.id("calendar_feeds"), colour: v.string() },
  handler: async (ctx, a) => {
    const user_id = await requireUser(ctx);
    if (!isCalColour(a.colour)) throw new ConvexError({ code: "input", message: "not a calendar colour" });
    const row = await ctx.db.get(a.id);
    if (!row || row.user_id !== user_id) return;
    await ctx.db.patch(a.id, { colour: a.colour });
  },
});

// The Calendar room's month: each day's events in [from, until], coloured by their calendar.
export const month = query({
  args: { from: v.string(), until: v.string() },
  handler: async (ctx, a) => {
    const user_id = await requireUser(ctx);
    checkDate(a.from);
    checkDate(a.until);
    if (a.until < a.from || daysBetween(a.from, a.until) > 62) throw new ConvexError({ code: "input", message: "two months at most" });
    const rows = await ctx.db.query("days")
      .withIndex("by_user_date", (q) => q.eq("user_id", user_id).gte("date", a.from).lte("date", a.until)).collect();
    const paint = await colourEvents(ctx.db, user_id);
    return rows.filter((d) => d.events.length).map((d) => ({ date: d.date, events: paint(d.events) }));
  },
});

// The cron: one check per user with feeds, each in its own action so a slow feed holds up no one else.
// ponytail: fans out every user each run; stagger or shard if there are thousands
export const syncAll = internalMutation({
  args: {},
  handler: async (ctx) => {
    const users = new Set((await ctx.db.query("calendar_feeds").collect()).map((r) => r.user_id));
    for (const user_id of users) await ctx.scheduler.runAfter(0, internal.calendar.checkUser, { user_id });
  },
});

// Is this feed as it was at the last full sync? The server's 304, or failing that the same bytes.
async function unchanged(r: Doc<"calendar_feeds">): Promise<boolean> {
  const headers: Record<string, string> = { accept: "text/calendar" };
  if (r.etag) headers["if-none-match"] = r.etag;
  if (r.last_modified) headers["if-modified-since"] = r.last_modified;
  try {
    const res = await fetch(r.url, { headers });
    if (res.status === 304) return true;
    if (!res.ok) return false;
    const text = await res.text();
    return text.length <= MAX_FEED_BYTES && (await feedHash(text)) === r.hash;
  } catch {
    return false;
  }
}

// The cron's look, on the default runtime: while every feed is unchanged and the day hasn't turned (the synced
// window moves with it), the events stand and only synced_at moves. Otherwise the full sync, in Node, does the parse.
export const checkUser = internalAction({
  args: { user_id: v.string() },
  handler: async (ctx, { user_id }) => {
    const rows = await ctx.runQuery(internal.calendar.feedsOf, { user_id });
    const t = today();
    for (const r of rows) {
      if (r.error || !r.hash || r.synced_day !== t || !(await unchanged(r))) {
        await ctx.scheduler.runAfter(0, internal.calendarSync.syncUser, { user_id });
        return;
      }
    }
    await ctx.runMutation(internal.calendar.markSynced, { ids: rows.map((r) => r._id) });
  },
});

export const markSynced = internalMutation({
  args: { ids: v.array(v.id("calendar_feeds")) },
  handler: async (ctx, a) => {
    const now = Date.now();
    for (const id of a.ids) if (await ctx.db.get(id)) await ctx.db.patch(id, { synced_at: now });
  },
});

export const feedsOf = internalQuery({
  args: { user_id: v.string() },
  handler: (ctx, a) => ctx.db.query("calendar_feeds").withIndex("by_user", (q) => q.eq("user_id", a.user_id)).collect(),
});

const ev = v.object({
  start: v.string(), end: v.string(), title: v.string(), where: v.optional(v.string()), allDay: v.optional(v.boolean()), feed: v.optional(v.string()),
});

// A sync starting: each feed notes when, so one that never finishes (the action died) shows as stuck, not syncing.
export const startSync = internalMutation({
  args: { ids: v.array(v.id("calendar_feeds")) },
  handler: async (ctx, a) => {
    const now = Date.now();
    for (const id of a.ids) if (await ctx.db.get(id)) await ctx.db.patch(id, { tried_at: now });
  },
});

export const writeSync = internalMutation({
  args: {
    user_id: v.string(), day: v.string(), from: v.string(), until: v.string(), days: v.union(v.record(v.string(), v.array(ev)), v.null()),
    results: v.array(v.object({
      id: v.id("calendar_feeds"), error: v.optional(v.string()),
      hash: v.optional(v.string()), etag: v.optional(v.string()), last_modified: v.optional(v.string()),
    })),
  },
  handler: async (ctx, a) => {
    const now = Date.now();
    for (const r of a.results) {
      const row = await ctx.db.get(r.id);
      if (!row) continue;
      // synced_day only when the events were written: a day held back by another feed's failure isn't laid out.
      await ctx.db.patch(r.id, r.error ? { error: r.error } : {
        synced_at: now, error: undefined, hash: r.hash, etag: r.etag, last_modified: r.last_modified, synced_day: a.days ? a.day : undefined,
      });
    }
    if (!a.days) return;
    const has = (await ctx.db.query("calendar_feeds").withIndex("by_user", (q) => q.eq("user_id", a.user_id)).first()) !== null;
    for (let d = a.from; d <= a.until; d = addDays(d, 1)) {
      const events = has ? a.days[d] ?? [] : []; // the last feed removed: its events go too
      const hit = await ctx.db.query("days").withIndex("by_user_date", (q) => q.eq("user_id", a.user_id).eq("date", d)).first();
      if (hit) {
        if (JSON.stringify(hit.events) !== JSON.stringify(events)) await ctx.db.patch(hit._id, { events });
      } else if (events.length) await ctx.db.insert("days", { user_id: a.user_id, date: d, headline: null, events });
    }
  },
});
