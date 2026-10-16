"use node";
// Node, for web-push (it signs with node's crypto). The reminders themselves: shared/notify.ts says what and when.
import webpush, { WebPushError } from "web-push";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import { requireUser } from "./lib/user";
import { dueNudges, type Nudge } from "../shared/notify.ts";

// The VAPID pair the push services know this app by: made the first time anyone asks, then kept for good.
async function vapid(ctx: ActionCtx): Promise<{ public_key: string; private_key: string }> {
  const kept = await ctx.runQuery(internal.push.keys, {});
  if (kept) return kept;
  const made = webpush.generateVAPIDKeys();
  return ctx.runMutation(internal.push.keepKeys, { public_key: made.publicKey, private_key: made.privateKey });
}

type Sub = { id: Id<"push_subs">; endpoint: string; p256dh: string; auth: string };

// One notification to one device; "gone" is one the push service has forgotten (uninstalled, turned off).
async function send(ctx: ActionCtx, sub: Sub, n: Nudge): Promise<"sent" | "gone" | "failed"> {
  const k = await vapid(ctx);
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:owner@toodoo.invalid", k.public_key, k.private_key);
  try {
    // A reminder an hour late is no reminder: the service may drop it if the device stays off that long.
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(n),
      { TTL: 60 * 60, urgency: "high", topic: n.tag.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) });
    return "sent";
  } catch (e) {
    if (e instanceof WebPushError && (e.statusCode === 404 || e.statusCode === 410)) return "gone";
    console.error("push: could not send", e instanceof Error ? e.message : e);
    return "failed";
  }
}

export const publicKey = action({
  args: {},
  handler: async (ctx): Promise<string> => {
    await requireUser(ctx);
    return (await vapid(ctx)).public_key;
  },
});

export const test = action({
  args: { endpoint: v.string() },
  handler: async (ctx, a): Promise<"sent" | "gone" | "failed"> => {
    const user_id = await requireUser(ctx);
    const sub = await ctx.runQuery(internal.push.subFor, { user_id, endpoint: a.endpoint });
    if (!sub) throw new ConvexError({ code: "input", message: "this device isn't turned on" });
    const r = await send(ctx, { id: sub._id, endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
      { title: "toodoo", body: "Reminders are on. This is how a due task will look.", url: "/", tag: "test" });
    if (r === "gone") await ctx.runMutation(internal.push.roundDone, { users: [], now: Date.now(), gone: [sub._id] });
    return r;
  },
});

// The cron: every task whose reminder falls since the last round, to every device its owner turned on.
export const round = internalAction({
  args: {},
  handler: async (ctx): Promise<void> => {
    const now = Date.now();
    const work = await ctx.runQuery(internal.push.roundWork, { now });
    const gone: Id<"push_subs">[] = [];
    for (const u of work) {
      for (const n of dueNudges(u.tasks, u.prefs, u.from, now)) {
        for (const s of u.subs) if ((await send(ctx, s, n)) === "gone" && !gone.includes(s.id)) gone.push(s.id);
      }
    }
    await ctx.runMutation(internal.push.roundDone, { users: work.map((u) => u.user_id), now, gone });
  },
});
