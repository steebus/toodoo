import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const str = v.union(v.string(), v.null());
const event = v.object({
  start: v.optional(v.string()), end: v.optional(v.string()), title: v.string(),
  where: v.optional(v.string()), allDay: v.optional(v.boolean()),
});

export default defineSchema({
  tasks: defineTable({
    user_id: v.string(),
    title: v.string(),
    description: str,
    note: str,
    link: str,
    source: v.string(),
    external_id: str,
    due: v.string(),
    time: str,
    priority: v.union(v.literal("high"), v.literal("med"), v.literal("low"), v.null()),
    estimate_mins: v.union(v.number(), v.null()),
    tags: v.array(v.string()),
    done: v.boolean(),
    done_on: str,
    sort_order: v.number(),
    created_at: v.string(),
    updated_at: v.number(),
  })
    .index("by_user_done", ["user_id", "done"])
    .index("by_user_source_ext", ["user_id", "source", "external_id"])
    .index("by_user_done_on", ["user_id", "done_on"]),
  days: defineTable({ user_id: v.string(), date: v.string(), headline: str, events: v.array(event) })
    .index("by_user_date", ["user_id", "date"]),
  plan_blocks: defineTable({
    user_id: v.string(), date: v.string(), task_id: v.id("tasks"), start: v.string(), mins: v.number(),
  })
    .index("by_user_date", ["user_id", "date"])
    .index("by_task", ["task_id"]),
});
