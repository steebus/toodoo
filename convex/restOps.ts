import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import * as m from "./model";

const uid = () => {
  const u = process.env.ALLOWED_USER_ID;
  if (!u) throw new Error("ALLOWED_USER_ID not set");
  return u;
};

export const add = internalMutation({
  args: { items: v.array(v.any()) },
  handler: (ctx, a) => m.addTasks(ctx.db, uid(), a.items, m.clock().t),
});
export const update = internalMutation({
  args: { source: v.string(), external_id: v.string(), patch: v.any() },
  handler: (ctx, a) =>
    m.updateTask(ctx.db, uid(), { source: a.source, external_id: a.external_id }, a.patch, m.clock().t).catch(m.asConvexError),
});
export const list = internalQuery({
  args: { source: v.union(v.string(), v.null()) },
  handler: (ctx, a) => m.listBySource(ctx.db, uid(), a.source),
});
