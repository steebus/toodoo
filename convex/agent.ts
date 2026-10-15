import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./lib/user";
import * as m from "./model";

const date = v.optional(v.string());
const ids = v.optional(v.array(v.string()));

// Queries are cached and don't re-run as time passes, so callers pass `now` (epoch ms) to keep "today" fresh.
const now = v.optional(v.number());
const at = (n?: number) => (n === undefined ? undefined : new Date(n));

export const getSnapshot = query({
  args: { date, query: v.optional(v.string()), now },
  handler: async (ctx, { now, ...a }) => m.snapshot(ctx.db, await requireUser(ctx), a, at(now)),
});
export const suggest = query({
  args: { date, limit: v.optional(v.number()), now },
  handler: async (ctx, { now, ...a }) => m.suggestNext(ctx.db, await requireUser(ctx), a, at(now)),
});
export const addTasks = mutation({
  args: { tasks: v.array(v.any()) },
  handler: async (ctx, a) => m.addTasks(ctx.db, await requireUser(ctx), a.tasks, m.clock().t),
});
const fillArgs = {
  date, from: v.optional(v.string()), until: v.optional(v.string()), keep: v.optional(v.boolean()), buffer: v.optional(v.number()),
  lunch: v.optional(v.boolean()), slack: v.optional(v.boolean()), seed: v.optional(v.number()), commit: v.optional(v.boolean()), now,
};
export const fillPlan = mutation({
  args: fillArgs,
  handler: async (ctx, { now = Date.now(), ...a }) => m.fillPlan(ctx.db, await requireUser(ctx), a, new Date(now)).catch(m.asConvexError),
});
export const replan = mutation({
  args: fillArgs,
  handler: async (ctx, { now = Date.now(), date: _d, ...a }) => m.replan(ctx.db, await requireUser(ctx), a, new Date(now)).catch(m.asConvexError),
});
export const meetings = query({
  args: { now },
  handler: async (ctx, { now = Date.now() }) => m.meetings(ctx.db, await requireUser(ctx), new Date(now)),
});
export const updateTask = mutation({
  args: { id: v.string(), patch: v.any() },
  handler: async (ctx, a) =>
    m.updateTask(ctx.db, await requireUser(ctx), { id: a.id }, a.patch, m.clock().t).catch(m.asConvexError),
});
export const setDay = mutation({
  args: { day: v.any() },
  handler: async (ctx, a) => m.setDay(ctx.db, await requireUser(ctx), a.day).catch(m.asConvexError),
});
export const deleteTask = mutation({
  args: { id: v.string() },
  handler: async (ctx, a) => m.deleteTask(ctx.db, await requireUser(ctx), a.id).catch(m.asConvexError),
});
export const plan = mutation({
  args: { date, task_ids: ids, from: v.optional(v.string()), until: v.optional(v.string()), mins: v.optional(v.number()), commit: v.optional(v.boolean()), now },
  handler: async (ctx, { now, ...a }) => m.planDay(ctx.db, await requireUser(ctx), a, at(now)),
});
export const unplan = mutation({
  args: { date: v.string(), task_ids: ids },
  handler: async (ctx, a) => m.unplan(ctx.db, await requireUser(ctx), a.date, a.task_ids),
});
export const board = query({
  args: { date, now },
  handler: async (ctx, { now = Date.now(), ...a }) => m.board(ctx.db, await requireUser(ctx), a, new Date(now)),
});
export const placeBlock = mutation({
  args: { task_id: v.string(), date: v.string(), start: v.string(), mins: v.number(), block_id: v.optional(v.string()) },
  handler: async (ctx, a) => m.placeBlock(ctx.db, await requireUser(ctx), a).catch(m.asConvexError),
});
export const removeBlock = mutation({
  args: { task_id: v.string(), date: v.string(), block_id: v.optional(v.string()) },
  handler: async (ctx, a) => m.removeBlock(ctx.db, await requireUser(ctx), a).catch(m.asConvexError),
});
export const prepTask = mutation({
  args: { date: v.string(), start: v.optional(v.string()), end: v.optional(v.string()), title: v.string(), where: v.optional(v.string()) },
  handler: async (ctx, a) => m.prepTask(ctx.db, await requireUser(ctx), a).catch(m.asConvexError),
});
