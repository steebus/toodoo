import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

// One-off cutover from the claude.ai artifact. Upserts by source+external_id, so re-runs overwrite imported fields.
export const run = internalMutation({
  args: { tasks: v.array(v.any()), days: v.array(v.any()), blocks: v.array(v.any()) },
  handler: async (ctx, a) => {
    const user_id = process.env.ALLOWED_USER_ID;
    if (!user_id) throw new Error("ALLOWED_USER_ID not set");
    const find = (source: string, external_id: string) => ctx.db.query("tasks")
      .withIndex("by_user_source_ext", (q) => q.eq("user_id", user_id).eq("source", source).eq("external_id", external_id)).first();
    for (const t of a.tasks) {
      const doc = { ...t, user_id, updated_at: Date.now() };
      const hit = await find(t.source, t.external_id);
      if (hit) await ctx.db.replace(hit._id, doc); else await ctx.db.insert("tasks", doc);
    }
    for (const d of a.days) {
      const hit = await ctx.db.query("days").withIndex("by_user_date", (q) => q.eq("user_id", user_id).eq("date", d.date)).first();
      const doc = { user_id, date: d.date, headline: d.headline ?? null, events: d.events ?? [] };
      if (hit) await ctx.db.replace(hit._id, doc); else await ctx.db.insert("days", doc);
    }
    let blocks = 0, dropped = 0;
    for (const b of a.blocks) {
      const task = await find(b.source, b.external_id);
      if (!task) { dropped++; continue; }
      const hit = (await ctx.db.query("plan_blocks").withIndex("by_task", (q) => q.eq("task_id", task._id)).collect())
        .find((x) => x.date === b.date);
      const doc = { user_id, date: b.date, task_id: task._id, start: b.start, mins: b.mins };
      if (hit) await ctx.db.replace(hit._id, doc); else await ctx.db.insert("plan_blocks", doc);
      blocks++;
    }
    return { tasks: a.tasks.length, days: a.days.length, blocks, dropped };
  },
});
