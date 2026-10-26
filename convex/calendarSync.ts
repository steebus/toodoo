"use node";
// Node, for its memory: a busy calendar's feed carries years of history, and parsing it whole outgrew the default
// runtime (the action died before it could record anything, and the feeds read "syncing" for good).
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";
import { icsEvents, type FeedEvent } from "../shared/ics.ts";
import { addDays, today } from "../shared/planning.ts";
import { feedHash, MAX_FEED_BYTES } from "../shared/calendars.ts";

const BACK = 35, AHEAD = 70; // days synced either side of today: the Calendar room's month, and the next

export const syncUser = internalAction({
  args: { user_id: v.string() },
  handler: async (ctx, { user_id }) => {
    const rows = await ctx.runQuery(internal.calendar.feedsOf, { user_id });
    await ctx.runMutation(internal.calendar.startSync, { ids: rows.map((r) => r._id) });
    const t = today();
    const from = addDays(t, -BACK), until = addDays(t, AHEAD);
    const byDate: Record<string, (FeedEvent & { feed: string })[]> = {};
    const results: { id: Id<"calendar_feeds">; error?: string; hash?: string; etag?: string; last_modified?: string }[] = [];
    for (const r of rows) {
      try {
        const res = await fetch(r.url, { headers: { accept: "text/calendar" } });
        if (!res.ok) throw new Error(`calendar said ${res.status}`);
        const text = await res.text();
        if (text.length > MAX_FEED_BYTES) throw new Error("calendar too big");
        for (const [d, list] of Object.entries(icsEvents(text, from, until))) (byDate[d] ??= []).push(...list.map((e) => ({ ...e, feed: r._id as string })));
        results.push({
          id: r._id, hash: await feedHash(text),
          etag: res.headers.get("etag") ?? undefined, last_modified: res.headers.get("last-modified") ?? undefined,
        });
      } catch (e) {
        results.push({ id: r._id, error: e instanceof Error ? e.message.slice(0, 200) : "sync failed" });
      }
    }
    // A feed that failed would read as an empty calendar: keep the last good events until every feed comes back.
    const ok = results.every((r) => !r.error);
    await ctx.runMutation(internal.calendar.writeSync, { user_id, day: t, from, until, days: ok ? byDate : null, results });
  },
});
