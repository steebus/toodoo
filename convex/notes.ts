import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./lib/user";
import * as m from "./model";

// Notes on a task, like comments: top-level notes, each with replies one level deep. The task's `note` follows the
// latest of them (what its docket previews), so every place that already prints a note keeps working.

const row = (n: Doc<"notes">) => ({
  id: n._id as string, parent_id: (n.parent_id as string | undefined) ?? null, author: n.author, text: n.text, created_at: n.created_at,
});

// Oldest first. A task with only a bare `note` (from before threads) is not here: the app shows that itself.
export const list = query({
  args: { task_id: v.string() },
  handler: async (ctx, a) => {
    const task = await m.ownedTask(ctx.db, await requireUser(ctx), a.task_id);
    if (!task) return [];
    const rows = await ctx.db.query("notes").withIndex("by_task", (q) => q.eq("task_id", task._id)).collect();
    return rows.sort((x, y) => x.created_at - y.created_at).map(row);
  },
});

export const add = mutation({
  args: { task_id: v.string(), text: v.string(), parent_id: v.optional(v.string()) },
  handler: async (ctx, a) => {
    const task = await m.ownedTask(ctx.db, await requireUser(ctx), a.task_id);
    if (!task) throw new ConvexError({ code: "not_found", message: "task not found" });
    const parent = a.parent_id === "legacy" ? "legacy" : a.parent_id ? ctx.db.normalizeId("notes", a.parent_id) : null;
    if (a.parent_id && !parent) throw new ConvexError({ code: "not_found", message: "note not found" });
    const id = await m.addNote(ctx.db, task, a.text, "steve", parent).catch(m.asConvexError);
    return row((await ctx.db.get(id))!);
  },
});

// A note goes with its replies; the task's note falls back to the latest one left (none: cleared).
export const remove = mutation({
  args: { id: v.string() },
  handler: async (ctx, a) => {
    const userId = await requireUser(ctx);
    const nid = ctx.db.normalizeId("notes", a.id);
    const doc = nid ? await ctx.db.get(nid) : null;
    if (!doc || doc.user_id !== userId) throw new ConvexError({ code: "not_found", message: "note not found" });
    const all = await ctx.db.query("notes").withIndex("by_task", (q) => q.eq("task_id", doc.task_id)).collect();
    const gone = new Set([doc._id as string, ...all.filter((n) => n.parent_id === doc._id).map((n) => n._id as string)]);
    for (const n of all) if (gone.has(n._id)) await ctx.db.delete(n._id);
    const last = all.filter((n) => !gone.has(n._id)).sort((x, y) => y.created_at - x.created_at)[0];
    const task = await ctx.db.get(doc.task_id);
    if (task) await ctx.db.patch(task._id, { note: last ? last.text.slice(0, 500) : null, updated_at: Date.now() });
    return { deleted: a.id };
  },
});
