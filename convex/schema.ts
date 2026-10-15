import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const str = v.union(v.string(), v.null());
const priority = v.union(v.literal("high"), v.literal("med"), v.literal("low"), v.null());
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
    due: str, // null: no due date
    time: str,
    priority,
    estimate_mins: v.union(v.number(), v.null()),
    tags: v.array(v.string()),
    done: v.boolean(),
    done_on: str,
    sort_order: v.number(),
    created_at: v.string(),
    updated_at: v.number(),
    // Optional so rows from before epics and Kanban still validate.
    epic_id: v.optional(v.union(v.id("epics"), v.null())),
    status: v.optional(v.union(v.literal("backlog"), v.literal("todo"), v.literal("doing"), v.literal("blocked"))),
    checklist: v.optional(v.array(v.object({ text: v.string(), done: v.boolean() }))),
  })
    .index("by_user_done", ["user_id", "done"])
    .index("by_user_epic", ["user_id", "epic_id"])
    .index("by_user_source_ext", ["user_id", "source", "external_id"])
    .index("by_user_done_on", ["user_id", "done_on"]),
  epics: defineTable({
    user_id: v.string(),
    title: v.string(),
    description: str,
    priority,
    status: v.union(v.literal("planned"), v.literal("active"), v.literal("on_hold"), v.literal("done")),
    colour: v.optional(v.union(v.string(), v.null())), // one of EPIC_COLOURS; checked on the way in
    sort_order: v.number(),
    created_at: v.string(),
    updated_at: v.number(),
  }).index("by_user", ["user_id"]),
  days: defineTable({ user_id: v.string(), date: v.string(), headline: str, events: v.array(event) })
    .index("by_user_date", ["user_id", "date"]),
  // A user's calendar feeds (secret iCal addresses): synced into days.events on a cron, never sent back whole.
  calendar_feeds: defineTable({
    user_id: v.string(), url: v.string(), synced_at: v.optional(v.number()), tried_at: v.optional(v.number()),
    error: v.optional(v.string()),
  }).index("by_user", ["user_id"]),
  // The Suggested inbox: tasks the agent or the Jira link proposes, until Steve accepts, rejects or combines them.
  // Settled rows stay (state not pending) so the same thing is never proposed twice.
  inbox: defineTable({
    user_id: v.string(),
    state: v.union(v.literal("pending"), v.literal("accepted"), v.literal("rejected"), v.literal("merged")),
    origin: v.string(), // who proposed it: "agent", "jira"
    title: v.string(),
    description: str,
    note: str,
    link: str,
    source: v.string(),
    external_id: str,
    due: str,
    time: str,
    priority,
    estimate_mins: v.union(v.number(), v.null()),
    tags: v.array(v.string()),
    epic_id: v.union(v.id("epics"), v.null()),
    status: v.optional(v.union(v.literal("backlog"), v.literal("todo"), v.literal("doing"), v.literal("blocked"))),
    checklist: v.optional(v.array(v.object({ text: v.string(), done: v.boolean() }))),
    raised_at: v.optional(v.number()), // when the source made it (a Jira issue's created), not when it was proposed
    project: v.optional(v.string()), // where it comes from in the source (a Jira project)
    task_id: v.optional(v.id("tasks")), // the task it became or went into
    undo: v.optional(v.any()), // combined: the task's fields as they were, for Undo
    created_at: v.number(),
    updated_at: v.number(),
  })
    .index("by_user_state", ["user_id", "state"])
    .index("by_user_source_ext", ["user_id", "source", "external_id"]),
  // The Jira link: a site, an account email and an API token (never sent back), and the JQL that picks the issues.
  jira_links: defineTable({
    user_id: v.string(), site: v.string(), email: v.string(), token: v.string(), jql: v.string(),
    synced_at: v.optional(v.number()), tried_at: v.optional(v.number()), error: v.optional(v.string()),
    count: v.optional(v.number()), account: v.optional(v.string()),
  }).index("by_user", ["user_id"]),
  plan_blocks: defineTable({
    user_id: v.string(), date: v.string(), task_id: v.id("tasks"), start: v.string(), mins: v.number(),
  })
    .index("by_user_date", ["user_id", "date"])
    .index("by_task", ["task_id"]),
});
