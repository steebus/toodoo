import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { requireUser } from "./lib/user";
import { icsEvents, type FeedEvent } from "../shared/ics.ts";
import { addDays, today } from "../shared/planning.ts";

const MAX_FEEDS = 5;
const MAX_BYTES = 5_000_000;
const BACK = 1, AHEAD = 21; // days synced either side of today

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
    return rows.map((r) => ({ id: r._id, label: feedLabel(r.url), synced_at: r.synced_at ?? null, error: r.error ?? null }));
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
    await ctx.db.insert("calendar_feeds", { user_id, url });
    await ctx.scheduler.runAfter(0, internal.calendar.syncUser, { user_id });
  },
});

export const removeFeed = mutation({
  args: { id: v.id("calendar_feeds") },
  handler: async (ctx, a) => {
    const user_id = await requireUser(ctx);
    const row = await ctx.db.get(a.id);
    if (!row || row.user_id !== user_id) return;
    await ctx.db.delete(a.id);
    await ctx.scheduler.runAfter(0, internal.calendar.syncUser, { user_id });
  },
});

// The cron: one sync per user with feeds, each in its own action so a slow feed holds up no one else.
// ponytail: fans out every user each run; stagger or shard if there are thousands
export const syncAll = internalMutation({
  args: {},
  handler: async (ctx) => {
    const users = new Set((await ctx.db.query("calendar_feeds").collect()).map((r) => r.user_id));
    for (const user_id of users) await ctx.scheduler.runAfter(0, internal.calendar.syncUser, { user_id });
  },
});

export const feedsOf = internalQuery({
  args: { user_id: v.string() },
  handler: (ctx, a) => ctx.db.query("calendar_feeds").withIndex("by_user", (q) => q.eq("user_id", a.user_id)).collect(),
});

export const syncUser = internalAction({
  args: { user_id: v.string() },
  handler: async (ctx, { user_id }) => {
    const rows = await ctx.runQuery(internal.calendar.feedsOf, { user_id });
    const t = today();
    const from = addDays(t, -BACK), until = addDays(t, AHEAD);
    const byDate: Record<string, FeedEvent[]> = {};
    const results: { id: Id<"calendar_feeds">; error?: string }[] = [];
    for (const r of rows) {
      try {
        const res = await fetch(r.url, { headers: { accept: "text/calendar" } });
        if (!res.ok) throw new Error(`calendar said ${res.status}`);
        const text = await res.text();
        if (text.length > MAX_BYTES) throw new Error("calendar too big");
        for (const [d, list] of Object.entries(icsEvents(text, from, until))) (byDate[d] ??= []).push(...list);
        results.push({ id: r._id });
      } catch (e) {
        results.push({ id: r._id, error: e instanceof Error ? e.message.slice(0, 200) : "sync failed" });
      }
    }
    // A feed that failed would read as an empty calendar: keep the last good events until every feed comes back.
    const ok = results.every((r) => !r.error);
    await ctx.runMutation(internal.calendar.writeSync, { user_id, from, until, days: ok ? byDate : null, results });
  },
});

const ev = v.object({ start: v.string(), end: v.string(), title: v.string(), where: v.optional(v.string()), allDay: v.optional(v.boolean()) });

export const writeSync = internalMutation({
  args: {
    user_id: v.string(), from: v.string(), until: v.string(), days: v.union(v.record(v.string(), v.array(ev)), v.null()),
    results: v.array(v.object({ id: v.id("calendar_feeds"), error: v.optional(v.string()) })),
  },
  handler: async (ctx, a) => {
    const now = Date.now();
    for (const r of a.results) {
      const row = await ctx.db.get(r.id);
      if (row) await ctx.db.patch(r.id, r.error ? { error: r.error } : { synced_at: now, error: undefined });
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
