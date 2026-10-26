import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireUser } from "./lib/user";
import { DEFAULT_REMIND_AT, dueNudges, LEAD_CHOICES, normTime, type Nudge, type Prefs } from "../shared/notify.ts";

const MAX_SUBS = 10;
const ROUND_MS = 5 * 60_000; // the cron's beat (crons.ts)
const FRESH: Prefs = { remind_at: DEFAULT_REMIND_AT, lead_mins: 15 };
const prefsOf = (p: Doc<"push_prefs"> | null): Prefs => (p ? { remind_at: p.remind_at, lead_mins: p.lead_mins } : FRESH);

// Settings' Notifications: when reminders fire, and whether this browser (its endpoint) is one that gets them.
export const status = query({
  args: { endpoint: v.optional(v.string()) },
  handler: async (ctx, a) => {
    const user_id = await requireUser(ctx);
    const p = await ctx.db.query("push_prefs").withIndex("by_user", (q) => q.eq("user_id", user_id)).first();
    const subs = await ctx.db.query("push_subs").withIndex("by_user", (q) => q.eq("user_id", user_id)).collect();
    return { ...prefsOf(p), devices: subs.length, subscribed: !!a.endpoint && subs.some((s) => s.endpoint === a.endpoint) };
  },
});

export const subscribe = mutation({
  args: { endpoint: v.string(), p256dh: v.string(), auth: v.string() },
  handler: async (ctx, a) => {
    const user_id = await requireUser(ctx);
    if (!/^https:\/\//.test(a.endpoint) || a.endpoint.length > 2000) throw new ConvexError({ code: "input", message: "not a push address" });
    const hit = await ctx.db.query("push_subs").withIndex("by_endpoint", (q) => q.eq("endpoint", a.endpoint)).first();
    if (hit) await ctx.db.patch(hit._id, { user_id, p256dh: a.p256dh, auth: a.auth });
    else {
      const n = (await ctx.db.query("push_subs").withIndex("by_user", (q) => q.eq("user_id", user_id)).collect()).length;
      if (n >= MAX_SUBS) throw new ConvexError({ code: "input", message: `${MAX_SUBS} devices at most` });
      await ctx.db.insert("push_subs", { user_id, endpoint: a.endpoint, p256dh: a.p256dh, auth: a.auth, created_at: Date.now() });
    }
    // The first device: reminders start from now, not from every task already gone by.
    const p = await ctx.db.query("push_prefs").withIndex("by_user", (q) => q.eq("user_id", user_id)).first();
    if (!p) await ctx.db.insert("push_prefs", { user_id, ...FRESH, round_at: Date.now() });
  },
});

export const unsubscribe = mutation({
  args: { endpoint: v.string() },
  handler: async (ctx, a) => {
    const user_id = await requireUser(ctx);
    const hit = await ctx.db.query("push_subs").withIndex("by_endpoint", (q) => q.eq("endpoint", a.endpoint)).first();
    if (hit && hit.user_id === user_id) await ctx.db.delete(hit._id);
  },
});

export const setPrefs = mutation({
  args: { remind_at: v.optional(v.string()), lead_mins: v.optional(v.number()) },
  handler: async (ctx, a) => {
    const user_id = await requireUser(ctx);
    const remind_at = a.remind_at === undefined ? undefined : normTime(a.remind_at);
    if (remind_at === null) throw new ConvexError({ code: "input", message: "not a time of day" });
    if (a.lead_mins !== undefined && !(LEAD_CHOICES as readonly number[]).includes(a.lead_mins)) {
      throw new ConvexError({ code: "input", message: "not a reminder lead" });
    }
    const p = await ctx.db.query("push_prefs").withIndex("by_user", (q) => q.eq("user_id", user_id)).first();
    const next = { ...prefsOf(p), ...(remind_at ? { remind_at } : {}), ...(a.lead_mins !== undefined ? { lead_mins: a.lead_mins } : {}) };
    if (p) await ctx.db.patch(p._id, next);
    else await ctx.db.insert("push_prefs", { user_id, ...next, round_at: Date.now() });
  },
});

// One device of the user's, for a test from Settings.
export const subFor = internalQuery({
  args: { user_id: v.string(), endpoint: v.string() },
  handler: async (ctx, a) => {
    const s = await ctx.db.query("push_subs").withIndex("by_endpoint", (q) => q.eq("endpoint", a.endpoint)).first();
    return s && s.user_id === a.user_id ? s : null;
  },
});

// The cron, on the default runtime so a quiet round costs next to nothing: each user with a device, the reminders
// falling since their last round. The window closes here; only a round with something to send wakes Node.
// ponytail: reads every subscriber's open tasks each round; fine for one user, index by due if there are many
export const round = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const subs = await ctx.db.query("push_subs").collect();
    const out: { subs: { id: Id<"push_subs">; endpoint: string; p256dh: string; auth: string }[]; nudges: Nudge[] }[] = [];
    for (const user_id of new Set(subs.map((s) => s.user_id))) {
      const p = await ctx.db.query("push_prefs").withIndex("by_user", (q) => q.eq("user_id", user_id)).first();
      const open = await ctx.db.query("tasks").withIndex("by_user_done", (q) => q.eq("user_id", user_id).eq("done", false)).collect();
      const tasks = open.filter((t) => t.due).map((t) => ({ id: t._id as string, title: t.title, due: t.due, time: t.time, done: t.done }));
      const nudges = dueNudges(tasks, prefsOf(p), p?.round_at ?? now - ROUND_MS, now);
      if (p) await ctx.db.patch(p._id, { round_at: now });
      else await ctx.db.insert("push_prefs", { user_id, ...FRESH, round_at: now });
      const mine = subs.filter((s) => s.user_id === user_id).map((s) => ({ id: s._id, endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth }));
      if (nudges.length) out.push({ subs: mine, nudges });
    }
    if (out.length) await ctx.scheduler.runAfter(0, internal.pushSend.deliver, { work: out });
  },
});

// Devices the push service has forgotten go.
export const dropSubs = internalMutation({
  args: { ids: v.array(v.id("push_subs")) },
  handler: async (ctx, a) => {
    for (const id of a.ids) if (await ctx.db.get(id)) await ctx.db.delete(id);
  },
});

export const keys = internalQuery({ args: {}, handler: (ctx) => ctx.db.query("push_keys").first() });

// Keep a new pair only where none is kept yet, so two first asks at once agree on one (the first written).
export const keepKeys = internalMutation({
  args: { public_key: v.string(), private_key: v.string() },
  handler: async (ctx, a) => {
    const hit = await ctx.db.query("push_keys").first();
    if (hit) return hit;
    const id = await ctx.db.insert("push_keys", a);
    return (await ctx.db.get(id))!;
  },
});
