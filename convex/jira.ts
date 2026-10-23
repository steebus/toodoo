import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery, mutation, query, type QueryCtx } from "./_generated/server";
import { requireUser } from "./lib/user";
import { softEpic, upsertProposal } from "./inbox";
import { fromBitbucket, type BitbucketPR } from "../shared/inbox.ts";
import { DEFAULT_JQL, fromJira, jiraSite, type JiraIssue } from "../shared/inbox.ts";

const FIELDS = [
  "summary", "description", "priority", "status", "duedate", "created", "labels", "project", "issuetype", "parent",
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
      tried_at: r.tried_at ?? null, error: r.error ?? null, count: r.count ?? null, account: r.account ?? null,
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
    if (hit) await ctx.db.patch(hit._id, { site, email, token, jql, error: undefined, account: undefined });
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
    for (const r of await ctx.db.query("jira_links").collect()) {
      await ctx.scheduler.runAfter(0, internal.jira.syncUser, { user_id: r.user_id });
      await ctx.scheduler.runAfter(0, internal.jira.syncBitbucket, { user_id: r.user_id });
    }
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
  raised_at: v.optional(v.number()), project: v.optional(v.string()),
});

// What a sync found: new issues land in Suggested, waiting ones are refreshed, and waiting ones Jira no longer
// returns (done, reassigned) go. A failed sync touches no suggestions.
export const writeSync = internalMutation({
  args: { user_id: v.string(), items: v.union(v.array(item), v.null()), error: v.optional(v.string()), account: v.optional(v.string()) },
  handler: async (ctx, a) => {
    const hit = await linkOf(ctx.db, a.user_id);
    if (!hit) return;
    if (!a.items) return void (await ctx.db.patch(hit._id, { error: a.error ?? "sync failed", account: a.account }));
    for (const { epic_names, ...p } of a.items) {
      await upsertProposal(ctx.db, a.user_id, { ...p, epic_id: await softEpic(ctx.db, a.user_id, epic_names) }, "jira");
    }
    const seen = new Set(a.items.map((x) => x.external_id));
    const waiting = await ctx.db.query("inbox").withIndex("by_user_state", (q) => q.eq("user_id", a.user_id).eq("state", "pending")).collect();
    for (const r of waiting) if (r.origin === "jira" && !seen.has(r.external_id)) await ctx.db.delete(r._id);
    // ponytail: a capped sync can't say what Jira lacks, so it keeps no list and Tidy skips the out-of-sync check
    const open_keys = a.items.length < PAGE * MAX_PAGES ? a.items.map((x) => x.external_id).filter((x): x is string => !!x) : undefined;
    await ctx.db.patch(hit._id, { synced_at: Date.now(), error: undefined, count: a.items.length, account: a.account, open_keys });
  },
});

const LOGIN_FAILED = "Jira didn't accept that email and API token: the email must be the Atlassian account that made the token";

// Jira's own words for a failure ("Field 'assigned' does not exist…"), falling back to the status.
async function why(res: Response): Promise<string> {
  if (res.status === 401 || res.status === 403) return LOGIN_FAILED;
  if (res.status === 404) return "No Jira site there: check the site name";
  const body = (await res.json().catch(() => null)) as { errorMessages?: string[]; errors?: Record<string, string> } | null;
  const said = [...(body?.errorMessages ?? []), ...Object.values(body?.errors ?? {})].join(" ");
  return res.status === 400 ? `Jira didn't like the JQL${said ? `: ${said}` : ""}` : `Jira said ${res.status}${said ? `: ${said}` : ""}`;
}

export const syncUser = internalAction({
  args: { user_id: v.string() },
  handler: async (ctx, { user_id }) => {
    const l = await ctx.runQuery(internal.jira.linkFor, { user_id });
    if (!l) return;
    await ctx.runMutation(internal.jira.startSync, { user_id });
    const headers = { authorization: `Basic ${btoa(`${l.email}:${l.token}`)}`, accept: "application/json", "content-type": "application/json" };
    let account: string | undefined;
    try {
      // Who we're signed in as first: a bad email or token doesn't fail the search, Jira just runs it as an anonymous
      // user and answers 200 with no issues, which would read as "0 open" rather than as the real problem.
      const me = await fetch(`${l.site}/rest/api/3/myself`, { headers });
      if (!me.ok) throw new Error(await why(me));
      const who = (await me.json()) as { displayName?: string; emailAddress?: string };
      account = [who.displayName, who.emailAddress && `<${who.emailAddress}>`].filter(Boolean).join(" ") || undefined;

      const issues: JiraIssue[] = [];
      let nextPageToken: string | undefined;
      for (let page = 0; page < MAX_PAGES; page++) {
        const res = await fetch(`${l.site}/rest/api/3/search/jql`, {
          method: "POST", headers,
          body: JSON.stringify({ jql: l.jql, fields: FIELDS, maxResults: PAGE, ...(nextPageToken ? { nextPageToken } : {}) }),
        });
        if (!res.ok) throw new Error(await why(res));
        if (/AUTHENTICATED_FAILED|AUTHENTICATION_DENIED/i.test(res.headers.get("x-seraph-loginreason") ?? "")) throw new Error(LOGIN_FAILED);
        const body = (await res.json()) as { issues?: JiraIssue[]; nextPageToken?: string; isLast?: boolean };
        issues.push(...(body.issues ?? []));
        nextPageToken = body.nextPageToken;
        if (!nextPageToken || body.isLast) break;
      }
      await ctx.runMutation(internal.jira.writeSync, { user_id, account, items: issues.filter((i) => i?.key).map((i) => fromJira(i, l.site)) });
    } catch (e) {
      await ctx.runMutation(internal.jira.writeSync, { user_id, account, items: null, error: e instanceof Error ? e.message.slice(0, 300) : "sync failed" });
    }
  },
});

// ---------- Bitbucket: open PRs waiting on me, from the same email and API token ----------

const BB = "https://api.bitbucket.org/2.0";
const BB_REPOS = 300, BB_RECENT_DAYS = 90; // ponytail: repos not touched in 90 days are skipped; a capped sync deletes nothing

const bbItem = v.object({
  title: v.string(), description: v.union(v.string(), v.null()), note: v.union(v.string(), v.null()), link: v.union(v.string(), v.null()),
  source: v.string(), external_id: v.union(v.string(), v.null()), due: v.union(v.string(), v.null()), time: v.union(v.string(), v.null()),
  priority: v.union(v.literal("high"), v.literal("med"), v.literal("low"), v.null()), estimate_mins: v.union(v.number(), v.null()),
  tags: v.array(v.string()), epic_names: v.array(v.string()), raised_at: v.optional(v.number()), project: v.optional(v.string()),
});

export const writeBitbucket = internalMutation({
  args: { user_id: v.string(), items: v.union(v.array(bbItem), v.null()), complete: v.optional(v.boolean()), error: v.optional(v.string()) },
  handler: async (ctx, a) => {
    const hit = await linkOf(ctx.db, a.user_id);
    if (!hit) return;
    if (!a.items) return void (await ctx.db.patch(hit._id, { bitbucket_error: a.error ?? "sync failed" }));
    for (const { epic_names, ...p } of a.items) {
      // the epic this project was tied to when an earlier suggestion was accepted, else a name match
      const tied = p.project
        ? await ctx.db.query("bitbucket_epics").withIndex("by_user_project", (q) => q.eq("user_id", a.user_id).eq("project", p.project!)).first()
        : null;
      const epic_id = (tied && (await ctx.db.get(tied.epic_id)) ? tied.epic_id : null) ?? (await softEpic(ctx.db, a.user_id, epic_names));
      await upsertProposal(ctx.db, a.user_id, { ...p, epic_id }, "bitbucket");
    }
    if (a.complete) {
      const seen = new Set(a.items.map((x) => x.external_id));
      const waiting = await ctx.db.query("inbox").withIndex("by_user_state", (q) => q.eq("user_id", a.user_id).eq("state", "pending")).collect();
      for (const r of waiting) if (r.origin === "bitbucket" && !seen.has(r.external_id)) await ctx.db.delete(r._id);
    }
    await ctx.db.patch(hit._id, { bitbucket_synced_at: Date.now(), bitbucket_error: undefined });
  },
});

export const syncBitbucket = internalAction({
  args: { user_id: v.string() },
  handler: async (ctx, { user_id }) => {
    const l = await ctx.runQuery(internal.jira.linkFor, { user_id });
    if (!l) return;
    const headers = { authorization: `Basic ${btoa(`${l.email}:${l.token}`)}`, accept: "application/json" };
    const get = async <T,>(url: string): Promise<T> => {
      const res = await fetch(url, { headers });
      if (res.status === 401 || res.status === 403) throw new Error("Bitbucket didn't accept the token: it needs read scopes for account, workspaces, repositories and pull requests");
      if (!res.ok) throw new Error(`Bitbucket said ${res.status}`);
      return (await res.json()) as T;
    };
    type Page<T> = { values?: T[]; next?: string };
    const all = async <T,>(url: string, cap: number): Promise<{ rows: T[]; capped: boolean }> => {
      const rows: T[] = [];
      for (let next: string | undefined = url; next; ) {
        const page: Page<T> = await get<Page<T>>(next);
        rows.push(...(page.values ?? []));
        next = page.next;
        if (rows.length >= cap) return { rows: rows.slice(0, cap), capped: !!next || rows.length > cap };
      }
      return { rows, capped: false };
    };
    try {
      const me = await get<{ uuid: string }>(`${BB}/user`);
      const since = new Date(Date.now() - BB_RECENT_DAYS * 86_400_000).toISOString();
      const workspaces = await all<{ slug: string }>(`${BB}/workspaces?pagelen=100`, 50);
      const items: ReturnType<typeof fromBitbucket>[] = [];
      let complete = !workspaces.capped, seenRepos = 0;
      for (const w of workspaces.rows) {
        const repos = await all<{ slug: string; full_name: string; project?: { name?: string } }>(
          `${BB}/repositories/${w.slug}?pagelen=100&q=${encodeURIComponent(`updated_on>${since}`)}`, BB_REPOS - seenRepos);
        seenRepos += repos.rows.length;
        if (repos.capped) complete = false;
        for (const r of repos.rows) {
          const q = encodeURIComponent(`state="OPEN" AND reviewers.uuid="${me.uuid}"`);
          const prs = await all<BitbucketPR>(`${BB}/repositories/${r.full_name}/pullrequests?pagelen=50&q=${q}`, 100);
          items.push(...prs.rows.map((pr) => fromBitbucket(pr, r.project?.name)));
        }
      }
      await ctx.runMutation(internal.jira.writeBitbucket, { user_id, items, complete });
    } catch (e) {
      await ctx.runMutation(internal.jira.writeBitbucket, { user_id, items: null, error: e instanceof Error ? e.message.slice(0, 300) : "sync failed" });
    }
  },
});
