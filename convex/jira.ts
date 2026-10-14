import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery, mutation, query, type QueryCtx } from "./_generated/server";
import { requireUser } from "./lib/user";
import { softEpic, upsertProposal } from "./inbox";
import { DEFAULT_JQL, fromJira, jiraSite, type JiraIssue } from "../shared/inbox.ts";

const FIELDS = [
  "summary", "description", "priority", "status", "duedate", "labels", "project", "issuetype", "parent",
  "timeoriginalestimate", "timeestimate", "aggregatetimeoriginalestimate",
];
const PAGE = 100, MAX_PAGES = 3; // ponytail: 300 issues at most a sync; narrow the JQL if that's not enough

const linkOf = (db: QueryCtx["db"], user_id: string) =>
  db.query("jira_links").withIndex("by_user", (q) => q.eq("user_id", user_id)).first();

// What the Suggested room shows of the link: never the token.
export const link = query({
  args: {},
  handler: async (ctx) => {
    const r = await linkOf(ctx.db, await requireUser(ctx));
    return r && {
      site: r.site, email: r.email, jql: r.jql, default_jql: DEFAULT_JQL, synced_at: r.synced_at ?? null,
      tried_at: r.tried_at ?? null, error: r.error ?? null, count: r.count ?? null,
    };
  },
});

// Link (or relink) a Jira Cloud site. The token may be left out to keep the one saved.
export const save = mutation({
  args: { site: v.string(), email: v.string(), token: v.optional(v.string()), jql: v.optional(v.string()) },
  handler: async (ctx, a) => {
    const user_id = await requireUser(ctx);
    const site = jiraSite(a.site);
    if (!site) throw new ConvexError({ code: "input", message: "site must be your-team.atlassian.net" });
    const email = a.email.trim();
    if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 200) throw new ConvexError({ code: "input", message: "needs your Atlassian account email" });
    const jql = (a.jql ?? "").trim() || DEFAULT_JQL;
    if (jql.length > 1000) throw new ConvexError({ code: "input", message: "JQL too long" });
    const hit = await linkOf(ctx.db, user_id);
    const token = a.token?.trim() || hit?.token;
    if (!token || token.length > 500) throw new ConvexError({ code: "input", message: "needs an API token" });
    if (hit) await ctx.db.patch(hit._id, { site, email, token, jql, error: undefined });
    else await ctx.db.insert("jira_links", { user_id, site, email, token, jql });
    await ctx.scheduler.runAfter(0, internal.jira.syncUser, { user_id });
  },
});

// Unlinked: the link goes, and so do the Jira suggestions still waiting. Accepted tasks stay.
export const remove = mutation({
  args: {},
  handler: async (ctx) => {
    const user_id = await requireUser(ctx);
    const hit = await linkOf(ctx.db, user_id);
    if (hit) await ctx.db.delete(hit._id);
    const waiting = await ctx.db.query("inbox").withIndex("by_user_state", (q) => q.eq("user_id", user_id).eq("state", "pending")).collect();
    for (const r of waiting) if (r.origin === "jira") await ctx.db.delete(r._id);
  },
});

export const syncNow = mutation({
  args: {},
  handler: async (ctx) => {
    const user_id = await requireUser(ctx);
    if (!(await linkOf(ctx.db, user_id))) throw new ConvexError({ code: "input", message: "Jira isn't linked" });
    await ctx.scheduler.runAfter(0, internal.jira.syncUser, { user_id });
  },
});

// The cron: each linked user in their own action.
export const syncAll = internalMutation({
  args: {},
  handler: async (ctx) => {
    for (const r of await ctx.db.query("jira_links").collect()) await ctx.scheduler.runAfter(0, internal.jira.syncUser, { user_id: r.user_id });
  },
});

export const linkFor = internalQuery({ args: { user_id: v.string() }, handler: (ctx, a) => linkOf(ctx.db, a.user_id) });

export const startSync = internalMutation({
  args: { user_id: v.string() },
  handler: async (ctx, a) => {
    const hit = await linkOf(ctx.db, a.user_id);
    if (hit) await ctx.db.patch(hit._id, { tried_at: Date.now() });
  },
});

const item = v.object({
  title: v.string(), description: v.union(v.string(), v.null()), note: v.union(v.string(), v.null()), link: v.union(v.string(), v.null()),
  source: v.string(), external_id: v.union(v.string(), v.null()), due: v.union(v.string(), v.null()), time: v.union(v.string(), v.null()),
  priority: v.union(v.literal("high"), v.literal("med"), v.literal("low"), v.null()), estimate_mins: v.union(v.number(), v.null()),
  tags: v.array(v.string()), status: v.optional(v.union(v.literal("backlog"), v.literal("todo"), v.literal("doing"), v.literal("blocked"))),
  checklist: v.optional(v.array(v.object({ text: v.string(), done: v.boolean() }))), epic_names: v.array(v.string()),
});

// What a sync found: new issues land in Suggested, waiting ones are refreshed, and waiting ones Jira no longer
// returns (done, reassigned) go. A failed sync touches no suggestions.
export const writeSync = internalMutation({
  args: { user_id: v.string(), items: v.union(v.array(item), v.null()), error: v.optional(v.string()) },
  handler: async (ctx, a) => {
    const hit = await linkOf(ctx.db, a.user_id);
    if (!hit) return;
    if (!a.items) return void (await ctx.db.patch(hit._id, { error: a.error ?? "sync failed" }));
    for (const { epic_names, ...p } of a.items) {
      await upsertProposal(ctx.db, a.user_id, { ...p, epic_id: await softEpic(ctx.db, a.user_id, epic_names) }, "jira");
    }
    const seen = new Set(a.items.map((x) => x.external_id));
    const waiting = await ctx.db.query("inbox").withIndex("by_user_state", (q) => q.eq("user_id", a.user_id).eq("state", "pending")).collect();
    for (const r of waiting) if (r.origin === "jira" && !seen.has(r.external_id)) await ctx.db.delete(r._id);
    await ctx.db.patch(hit._id, { synced_at: Date.now(), error: undefined, count: a.items.length });
  },
});

const why = (status: number) =>
  status === 401 || status === 403 ? "Jira said no: check the email and API token" : status === 400 ? "Jira didn't like the JQL" : `Jira said ${status}`;

export const syncUser = internalAction({
  args: { user_id: v.string() },
  handler: async (ctx, { user_id }) => {
    const l = await ctx.runQuery(internal.jira.linkFor, { user_id });
    if (!l) return;
    await ctx.runMutation(internal.jira.startSync, { user_id });
    try {
      const issues: JiraIssue[] = [];
      let nextPageToken: string | undefined;
      for (let page = 0; page < MAX_PAGES; page++) {
        const res = await fetch(`${l.site}/rest/api/3/search/jql`, {
          method: "POST",
          headers: {
            authorization: `Basic ${btoa(`${l.email}:${l.token}`)}`, accept: "application/json", "content-type": "application/json",
          },
          body: JSON.stringify({ jql: l.jql, fields: FIELDS, maxResults: PAGE, ...(nextPageToken ? { nextPageToken } : {}) }),
        });
        if (!res.ok) throw new Error(why(res.status));
        const body = (await res.json()) as { issues?: JiraIssue[]; nextPageToken?: string; isLast?: boolean };
        issues.push(...(body.issues ?? []));
        nextPageToken = body.nextPageToken;
        if (!nextPageToken || body.isLast) break;
      }
      await ctx.runMutation(internal.jira.writeSync, { user_id, items: issues.filter((i) => i?.key).map((i) => fromJira(i, l.site)) });
    } catch (e) {
      await ctx.runMutation(internal.jira.writeSync, { user_id, items: null, error: e instanceof Error ? e.message.slice(0, 200) : "sync failed" });
    }
  },
});
