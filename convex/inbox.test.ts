// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const setup = () => convexTest(schema, modules).withIdentity({ subject: "user_steve" });

beforeEach(() => {
  vi.stubEnv("ALLOWED_USER_ID", "user_steve");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-12T02:00:00Z"));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

const jiraItem = (key: string, o: Record<string, unknown> = {}) => ({
  title: `${key} Fix login`, description: "Users bounce", note: null, link: `https://acme.atlassian.net/browse/${key}`,
  source: "jira", external_id: `jira:${key}`, due: null, time: null, priority: "high" as const, estimate_mins: 90,
  tags: ["work"], epic_names: [], ...o,
});

it("puts proposals in Suggested, not on the list, and never twice", async () => {
  const t = setup();
  await t.mutation(api.agent.addTasks, { tasks: [{ title: "Reply to Sam" }] });
  const r = await t.mutation(api.inbox.proposeTasks, {
    tasks: [{ title: "Reply to Sam" }, { title: "Pay rego", source: "email", external_id: "gmail:1" }],
  });
  expect(r.proposed).toEqual([{ title: "Pay rego" }]);
  expect(r.skipped.map((s) => s.title)).toEqual(["Reply to Sam"]);
  expect((await t.query(api.agent.board, {})).tasks.map((x) => x.title)).toEqual(["Reply to Sam"]);
  expect(await t.query(api.inbox.count, {})).toBe(1);
  expect((await t.query(api.agent.getSnapshot, {})).suggested_waiting).toBe(1);

  const { items } = await t.query(api.inbox.list, {});
  await t.mutation(api.inbox.rejectOne, { id: items[0].id });
  expect(await t.query(api.inbox.count, {})).toBe(0);
  // Rejected stays rejected: the next run's proposal of it is skipped.
  const again = await t.mutation(api.inbox.proposeTasks, { tasks: [{ title: "Pay rego (again)", source: "email", external_id: "gmail:1" }] });
  expect(again.proposed).toEqual([]);
  await t.mutation(api.inbox.undoOne, { id: items[0].id });
  expect(await t.query(api.inbox.count, {})).toBe(1);
});

it("accepts a suggestion as a task, with undo", async () => {
  const t = setup();
  const epic = await t.mutation(api.epics.create, { epic: { title: "Acme" } });
  await t.mutation(api.inbox.proposeTasks, { tasks: [{ title: "Ship it", epic: "acme", estimate_mins: "1h", status: "In Progress" }] });
  const { items } = await t.query(api.inbox.list, {});
  const a = await t.mutation(api.inbox.acceptOne, { id: items[0].id });
  const made = (await t.query(api.agent.board, {})).tasks.find((x) => x.id === a.task_id);
  expect(made).toMatchObject({ title: "Ship it", epic_id: epic.id, estimate_mins: 60, status: "doing" });
  await expect(t.mutation(api.inbox.acceptOne, { id: items[0].id })).rejects.toThrow(/already sorted/);
  await t.mutation(api.inbox.undoOne, { id: items[0].id });
  expect((await t.query(api.agent.board, {})).tasks).toEqual([]);
  expect(await t.query(api.inbox.count, {})).toBe(1);
});

it("accepts a suggestion with Steve's edits laid over it", async () => {
  const t = setup();
  await t.mutation(api.inbox.proposeTasks, { tasks: [{ title: "Reply to Sam", priority: "low", due: "2026-10-20" }] });
  const { items } = await t.query(api.inbox.list, {});
  const a = await t.mutation(api.inbox.acceptOne, { id: items[0].id, edits: { title: "Reply to Sam today", due: "2026-10-13", priority: "high", status: "blocked" } });
  expect(a.title).toBe("Reply to Sam today");
  const made = (await t.query(api.agent.board, {})).tasks.find((x) => x.id === a.task_id);
  expect(made).toMatchObject({ title: "Reply to Sam today", due: "2026-10-13", priority: "high", status: "blocked" });
  await expect(t.mutation(api.inbox.acceptOne, { id: items[0].id, edits: { due: "nope" } })).rejects.toThrow();
});

it("combines a Jira suggestion into Steve's own task, which then stays linked", async () => {
  const t = setup();
  const { created } = await t.mutation(api.agent.addTasks, { tasks: [{ title: "Login bug", priority: "low" }] });
  await t.mutation(internal.jira.writeSync, { user_id: "user_steve", items: null }); // no link: nothing happens
  await t.run((ctx) => ctx.db.insert("jira_links", { user_id: "user_steve", site: "https://acme.atlassian.net", email: "s@x.io", token: "k", jql: "x" }));
  await t.mutation(internal.jira.writeSync, { user_id: "user_steve", items: [jiraItem("ACME-7")] });
  const { items } = await t.query(api.inbox.list, {});
  expect(items[0]).toMatchObject({ origin: "jira", title: "ACME-7 Fix login" });

  const c = await t.mutation(api.inbox.combineOne, { id: items[0].id, task_id: created[0].id });
  expect(c.changed).toEqual(expect.arrayContaining(["description", "link", "estimate_mins", "external_id"]));
  const task = (await t.query(api.agent.board, {})).tasks[0];
  expect(task).toMatchObject({ title: "Login bug", priority: "low", estimate_mins: 90, source: "jira", external_id: "jira:ACME-7" });

  // The next sync knows it: nothing new in Suggested.
  await t.mutation(internal.jira.writeSync, { user_id: "user_steve", items: [jiraItem("ACME-7", { title: "ACME-7 Fix login redirect" })] });
  expect(await t.query(api.inbox.count, {})).toBe(0);

  // Undo puts the task back as it was.
  await t.mutation(api.inbox.undoOne, { id: items[0].id });
  expect((await t.query(api.agent.board, {})).tasks[0]).toMatchObject({ source: "you", external_id: null, estimate_mins: null, description: null });
});

it("syncs Jira: refreshes waiting issues and drops ones Jira no longer returns", async () => {
  const t = setup();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-12T02:00:00Z"));
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ issues: [], isLast: true })));
  await t.mutation(api.jira.save, { site: "acme", email: "steve@example.com", token: "secret" });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  await expect(t.mutation(api.jira.save, { site: "evil.com", email: "steve@example.com" })).rejects.toThrow(/atlassian/);
  const link = await t.query(api.jira.link, {});
  expect(link).toMatchObject({ site: "https://acme.atlassian.net", email: "steve@example.com" });
  expect(JSON.stringify(link)).not.toContain("secret");

  await t.mutation(internal.jira.writeSync, { user_id: "user_steve", items: [jiraItem("A-1"), jiraItem("A-2")] });
  expect(await t.query(api.inbox.count, {})).toBe(2);
  await t.mutation(internal.jira.writeSync, { user_id: "user_steve", items: [jiraItem("A-1", { estimate_mins: 30 })] });
  const { items } = await t.query(api.inbox.list, {});
  expect(items.map((x) => [x.external_id, x.estimate_mins])).toEqual([["jira:A-1", 30]]);
  // A failed sync keeps what's waiting.
  await t.mutation(internal.jira.writeSync, { user_id: "user_steve", items: null, error: "Jira said 500" });
  expect(await t.query(api.inbox.count, {})).toBe(1);
  expect((await t.query(api.jira.link, {}))?.error).toBe("Jira said 500");
  // The morning run sees a broken link as no link, and why: it gathers Jira itself and tells Steve.
  expect(await t.query(api.agent.getSnapshot, {})).toMatchObject({
    jira_link: false, jira_error: "Jira said 500", suggested_waiting: 1, suggested_by_source: { jira: 1 },
  });
  await t.mutation(internal.jira.writeSync, { user_id: "user_steve", items: [jiraItem("A-1", { estimate_mins: 30 })] });
  expect(await t.query(api.agent.getSnapshot, {})).toMatchObject({ jira_link: true, jira_error: null });
  vi.setSystemTime(Date.now() + 3 * 3_600_000); // the cron stalled
  expect(await t.query(api.agent.getSnapshot, {})).toMatchObject({ jira_link: false, jira_error: "no sync for 3h" });
  await t.mutation(api.jira.remove, {});
  expect(await t.query(api.inbox.count, {})).toBe(0);
});

it("fetches issues from Jira's search with the saved token", async () => {
  const t = setup();
  await t.run((ctx) => ctx.db.insert("jira_links", { user_id: "user_steve", site: "https://acme.atlassian.net", email: "s@x.io", token: "k", jql: "assignee = currentUser()" }));
  const fetch = vi.fn(async (url: string) => url.endsWith("/myself")
    ? Response.json({ displayName: "Steve", emailAddress: "s@x.io" })
    : Response.json({ issues: [{ key: "ACME-9", fields: {
      summary: "Do it", timeoriginalestimate: 1800, created: "2026-10-01T09:30:00.000+0000", project: { name: "Acme" },
    } }], isLast: true }));
  vi.stubGlobal("fetch", fetch);
  await t.action(internal.jira.syncUser, { user_id: "user_steve" });
  const [url, init] = fetch.mock.calls[1] as unknown as [string, RequestInit];
  expect(url).toBe("https://acme.atlassian.net/rest/api/3/search/jql");
  expect((init.headers as Record<string, string>).authorization).toBe(`Basic ${btoa("s@x.io:k")}`);
  expect(JSON.parse(init.body as string)).toMatchObject({ jql: "assignee = currentUser()" });
  const { items } = await t.query(api.inbox.list, {});
  expect(items[0]).toMatchObject({ title: "Do it", estimate_mins: 30, raised_at: Date.parse("2026-10-01T09:30:00Z"), project: "Acme" });
  expect(await t.query(api.jira.link, {})).toMatchObject({ count: 1, error: null, account: "Steve <s@x.io>" });
});

it("calls a bad email or token a failed login, not an empty search", async () => {
  const t = setup();
  await t.run((ctx) => ctx.db.insert("jira_links", { user_id: "user_steve", site: "https://acme.atlassian.net", email: "typo@x.io", token: "k", jql: "x" }));
  // Jira answers a bad login with 401 on /myself, but 200 and no issues on the search.
  vi.stubGlobal("fetch", vi.fn(async (url: string) => url.endsWith("/myself")
    ? new Response(null, { status: 401 })
    : Response.json({ issues: [], isLast: true }, { headers: { "x-seraph-loginreason": "AUTHENTICATED_FAILED" } })));
  await t.action(internal.jira.syncUser, { user_id: "user_steve" });
  expect((await t.query(api.jira.link, {}))?.error).toMatch(/didn't accept that email/);
});

it("passes on Jira's words about bad JQL", async () => {
  const t = setup();
  await t.run((ctx) => ctx.db.insert("jira_links", { user_id: "user_steve", site: "https://acme.atlassian.net", email: "s@x.io", token: "k", jql: "assigned = x" }));
  vi.stubGlobal("fetch", vi.fn(async (url: string) => url.endsWith("/myself")
    ? Response.json({ displayName: "Steve" })
    : Response.json({ errorMessages: ["Field 'assigned' does not exist or you do not have permission to view it."] }, { status: 400 })));
  await t.action(internal.jira.syncUser, { user_id: "user_steve" });
  expect(await t.query(api.jira.link, {})).toMatchObject({ error: expect.stringMatching(/JQL: Field 'assigned' does not exist/), account: "Steve" });
});

it("makes one prep task per event", async () => {
  const t = setup();
  const ev = { date: "2026-10-13", start: "09:15", end: "09:45", title: "Client demo", where: "Zoom" };
  const a = await t.mutation(api.agent.prepTask, ev);
  expect(a).toMatchObject({ title: "Prep: Client demo", created: true });
  const b = await t.mutation(api.agent.prepTask, ev);
  expect(b).toMatchObject({ id: a.id, created: false });
  const task = (await t.query(api.agent.board, { date: "2026-10-13" })).tasks.find((x) => x.id === a.id);
  expect(task).toMatchObject({ due: "2026-10-13", estimate_mins: 15, note: "09:15–09:45 · Zoom", source: "calendar" });
  expect(task?.prep_for).toEqual({ date: "2026-10-13", start: "09:15", title: "Client demo" });
});

it("links a task (a Jira card, say) to a meeting as its prep, and both sides show it", async () => {
  const t = setup();
  await t.mutation(api.agent.setDay, { day: { date: "2026-10-13", events: [{ start: "09:15", end: "09:45", title: "Client demo" }, { start: "11:00", end: "12:00", title: "Review" }] } });
  const { created } = await t.mutation(api.agent.addTasks, { tasks: [{ title: "Demo script", source: "jira", external_id: "jira:ACME-4" }] });
  const id = created[0].id;
  const r = await t.mutation(api.agent.updateTask, { id, patch: { prep_for: { date: "2026-10-13", start: "9:15", title: "Client demo" } } });
  expect(r.prep_for).toEqual({ date: "2026-10-13", start: "09:15", title: "Client demo" });
  const snap = await t.query(api.agent.getSnapshot, { date: "2026-10-13" });
  expect(snap.day?.events[0]).toMatchObject({ title: "Client demo", prep: [{ id, title: "Demo script", done: false }] });
  expect(snap.day?.events[1]).not.toHaveProperty("prep");
  expect([...snap.tasks.due, ...snap.tasks.undated, ...snap.tasks.carried].find((x) => x.id === id)).toMatchObject({ prep_for: { title: "Client demo" } });
  expect(await t.query(api.agent.meetings, { now: Date.parse("2026-10-12T22:00:00Z") })).toEqual([
    { date: "2026-10-13", start: "09:15", end: "09:45", title: "Client demo", where: null },
    { date: "2026-10-13", start: "11:00", end: "12:00", title: "Review", where: null },
  ]);
  await t.mutation(api.agent.updateTask, { id, patch: { prep_for: null } });
  expect((await t.query(api.agent.getSnapshot, { date: "2026-10-13" })).day?.events[0]).not.toHaveProperty("prep");
  await expect(t.mutation(api.agent.updateTask, { id, patch: { prep_for: { date: "soon", title: "x" } } })).rejects.toThrow(/date/);
});

it("auto plan fills a day and, when not keeping, swaps out the blocks ahead", async () => {
  const t = setup();
  const now = Date.parse("2026-10-12T22:00:00Z"); // 8am Brisbane, the 13th
  const { created } = await t.mutation(api.agent.addTasks, { tasks: [
    { title: "Report", due: "2026-10-13", estimate_mins: 60, priority: "high" },
    { title: "Quick call", due: "2026-10-13", estimate_mins: 10 },
  ] });
  await t.mutation(api.agent.placeBlock, { task_id: created[1].id, date: "2026-10-13", start: "11:00", mins: 10 });
  const dry = await t.mutation(api.agent.fillPlan, { date: "2026-10-13", from: "09:00", until: "10:30", now });
  expect(dry.proposed.map((p) => [p.title, p.start])).toEqual([["Report", "09:00"]]); // the call is planned already: kept
  const r = await t.mutation(api.agent.fillPlan, { date: "2026-10-13", from: "09:00", until: "12:00", keep: false, commit: true, now });
  expect(r.replaced).toEqual([{ task_id: created[1].id, start: "11:00", mins: 10 }]);
  expect(r.proposed.map((p) => [p.title, p.start])).toEqual([["Quick call", "09:00"], ["Report", "09:10"]]);
  const blocks = (await t.query(api.agent.board, { date: "2026-10-13", now })).blocks.map((b) => b.start).sort();
  expect(blocks).toEqual(["09:00", "09:10"]);
});

it("replan from now takes off today's missed blocks, refills the day, and carries what won't fit to tomorrow", async () => {
  const t = setup();
  const now = Date.parse("2026-10-13T04:00:00Z"); // 2pm Brisbane, the 13th
  const { created } = await t.mutation(api.agent.addTasks, { tasks: [
    { title: "Missed", due: "2026-10-13", estimate_mins: 30 },
    { title: "Done one", due: "2026-10-13", estimate_mins: 30 },
  ] });
  const [missed, doneOne] = created.map((c) => c.id);
  await t.mutation(api.agent.placeBlock, { task_id: missed, date: "2026-10-13", start: "09:00", mins: 30 });
  await t.mutation(api.agent.placeBlock, { task_id: doneOne, date: "2026-10-13", start: "10:00", mins: 30 });
  await t.mutation(api.agent.updateTask, { id: doneOne, patch: { done: true } });
  const r = await t.mutation(api.agent.replan, { from: "09:00", until: "14:20", lunch: false, commit: true, now });
  expect(r.removed).toEqual([{ task_id: missed, start: "09:00", mins: 30 }]); // the done one's block stays as history
  expect(r.proposed).toEqual([]); // 15 minutes left today: not enough
  expect(r.tomorrow.map((p) => [p.title, p.date, p.start])).toEqual([["Missed", "2026-10-14", "09:00"]]);
  const today = (await t.query(api.agent.board, { date: "2026-10-13", now })).blocks.filter((b) => b.date === "2026-10-13");
  expect(today.map((b) => b.start)).toEqual(["10:00"]);
});

it("syncs Bitbucket: accepting into an epic ties the project to it for the next PR", async () => {
  const t = setup();
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ issues: [], isLast: true })));
  await t.mutation(api.jira.save, { site: "acme", email: "steve@example.com", token: "secret" });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const epic = await t.mutation(api.epics.create, { epic: { title: "Billing" } });
  const pr = (id: number) => ({
    title: `Review: PR ${id}`, description: null, note: "From Pat · api", link: null, source: "bitbucket", external_id: `bitbucket:acme/api#${id}`,
    due: null, time: null, priority: null, estimate_mins: null, tags: ["work", "review"], epic_names: ["Platform", "api"], project: "Platform",
  });
  await t.mutation(internal.jira.writeBitbucket, { user_id: "user_steve", items: [pr(1)], complete: true });
  const first = (await t.query(api.inbox.list, {})).items[0];
  expect(first.epic_id).toBeNull();
  await t.mutation(api.inbox.acceptOne, { id: first.id, edits: { epic_id: epic.id } });
  await t.mutation(internal.jira.writeBitbucket, { user_id: "user_steve", items: [pr(2)], complete: true });
  expect((await t.query(api.inbox.list, {})).items.map((x) => [x.external_id, x.epic_id])).toEqual([["bitbucket:acme/api#2", epic.id]]);
  // a PR that closed drops out of a complete sync
  await t.mutation(internal.jira.writeBitbucket, { user_id: "user_steve", items: [], complete: true });
  expect(await t.query(api.inbox.count, {})).toBe(0);
});

it("polls Bitbucket only with its own token, and never sends either token back", async () => {
  const t = setup();
  const auth: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).includes("bitbucket")) auth.push(String((init?.headers as Record<string, string>).authorization));
    return Response.json(String(url).includes("/user") ? { uuid: "{me}" } : { issues: [], isLast: true, values: [] });
  }));
  await t.mutation(api.jira.save, { site: "acme", email: "steve@example.com", token: "jira-tok" });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(auth).toEqual([]); // no Bitbucket token: no Bitbucket calls
  await t.mutation(api.jira.save, { site: "acme", email: "steve@example.com", bitbucket_token: "bb-tok" });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(auth.length).toBeGreaterThan(0);
  expect(new Set(auth)).toEqual(new Set([`Basic ${btoa("steve@example.com:bb-tok")}`]));
  const link = await t.query(api.jira.link, {});
  expect(link?.bitbucket_linked).toBe(true);
  expect(JSON.stringify(link)).not.toMatch(/bb-tok|jira-tok/);
});

it("keeps a repo on an epic, hands it to Claude's tasks, and lets a patch clear Claude's status", async () => {
  const t = setup();
  const epic = await t.mutation(api.epics.create, { epic: { title: "Acme", repo: " steebus/acme " } });
  expect(epic.repo).toBe("steebus/acme");
  const { created: [{ id: made }] } = await t.mutation(api.agent.addTasks, { tasks: [{ title: "Fix it", epic: "acme", assignee: "claude" }] });
  const snap = await t.query(api.agent.getSnapshot, { query: "@claude" });
  expect(JSON.stringify(snap)).toContain('"epic_repo":"steebus/acme"');
  await t.mutation(api.agent.updateTask, { id: made, patch: { claude_status: "review", assignee: "steve" } });
  const cleared = await t.mutation(api.agent.updateTask, { id: made, patch: { claude_status: null } });
  expect(cleared.claude_status).toBeNull();
});
