import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireUser } from "./lib/user";
import * as m from "./model";

// Stats and All tasks: every task, epic and block in the account.
export const everything = query({
  args: { now: v.optional(v.number()) },
  handler: async (ctx, { now = Date.now() }) => m.everything(ctx.db, await requireUser(ctx), new Date(now)),
});
