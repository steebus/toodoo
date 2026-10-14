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
  await t.mutation(api.jira.remove, {});
  expect(await t.query(api.inbox.count, {})).toBe(0);
});

it("fetches issues from Jira's search with the saved token", async () => {
  const t = setup();
  await t.run((ctx) => ctx.db.insert("jira_links", { user_id: "user_steve", site: "https://acme.atlassian.net", email: "s@x.io", token: "k", jql: "assignee = currentUser()" }));
  const fetch = vi.fn(async () => Response.json({ issues: [{ key: "ACME-9", fields: { summary: "Do it", timeoriginalestimate: 1800 } }], isLast: true }));
  vi.stubGlobal("fetch", fetch);
  await t.action(internal.jira.syncUser, { user_id: "user_steve" });
  const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe("https://acme.atlassian.net/rest/api/3/search/jql");
  expect((init.headers as Record<string, string>).authorization).toBe(`Basic ${btoa("s@x.io:k")}`);
  expect(JSON.parse(init.body as string)).toMatchObject({ jql: "assignee = currentUser()" });
  const { items } = await t.query(api.inbox.list, {});
  expect(items[0]).toMatchObject({ title: "Do it", estimate_mins: 30 });
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
});
