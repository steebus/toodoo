import { ConvexError, v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { requireUser } from "./lib/user";
import { DEFAULT_REMIND_AT, LEAD_CHOICES, normTime, type Prefs } from "../shared/notify.ts";

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

// A round's work: each user with a device, their devices, their open dated tasks and the window since the last round.
// ponytail: reads every subscriber's open tasks each round; fine for one user, index by due if there are many
export const roundWork = internalQuery({
  args: { now: v.number() },
  handler: async (ctx, { now }) => {
    const subs = await ctx.db.query("push_subs").collect();
    const users = [...new Set(subs.map((s) => s.user_id))];
    return Promise.all(users.map(async (user_id) => {
      const p = await ctx.db.query("push_prefs").withIndex("by_user", (q) => q.eq("user_id", user_id)).first();
      const open = await ctx.db.query("tasks").withIndex("by_user_done", (q) => q.eq("user_id", user_id).eq("done", false)).collect();
      return {
        user_id, prefs: prefsOf(p), from: p?.round_at ?? now - ROUND_MS,
        subs: subs.filter((s) => s.user_id === user_id).map((s) => ({ id: s._id, endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth })),
        tasks: open.filter((t) => t.due).map((t) => ({ id: t._id as string, title: t.title, due: t.due, time: t.time, done: t.done })),
      };
    }));
  },
});

// A round sent: the window closes at `now`, and devices the push service has forgotten go.
export const roundDone = internalMutation({
  args: { users: v.array(v.string()), now: v.number(), gone: v.array(v.id("push_subs")) },
  handler: async (ctx, a) => {
    for (const id of a.gone) if (await ctx.db.get(id)) await ctx.db.delete(id);
    for (const user_id of a.users) {
      const p = await ctx.db.query("push_prefs").withIndex("by_user", (q) => q.eq("user_id", user_id)).first();
      if (p) await ctx.db.patch(p._id, { round_at: a.now });
      else await ctx.db.insert("push_prefs", { user_id, ...FRESH, round_at: a.now });
    }
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
