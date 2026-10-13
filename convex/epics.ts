import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./lib/user";
import * as m from "./model";

export const list = query({
  args: {},
  handler: async (ctx) => m.listEpics(ctx.db, await requireUser(ctx)),
});
export const create = mutation({
  args: { epic: v.any() },
  handler: async (ctx, a) => m.createEpic(ctx.db, await requireUser(ctx), a.epic).catch(m.asConvexError),
});
export const update = mutation({
  args: { id: v.string(), patch: v.any() },
  handler: async (ctx, a) => m.updateEpic(ctx.db, await requireUser(ctx), a.id, a.patch).catch(m.asConvexError),
});
export const remove = mutation({
  args: { id: v.string() },
  handler: async (ctx, a) => m.deleteEpic(ctx.db, await requireUser(ctx), a.id).catch(m.asConvexError),
});
// The Kanban and Epics screens: open tasks, the last fortnight's done, and every epic.
export const workspace = query({
  args: { now: v.optional(v.number()) },
  handler: async (ctx, { now = Date.now() }) => m.workspace(ctx.db, await requireUser(ctx), new Date(now)),
});
