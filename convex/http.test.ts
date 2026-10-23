// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { beforeEach, expect, it, vi } from "vitest";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
beforeEach(() => { vi.stubEnv("ALLOWED_USER_ID", "user_steve"); vi.stubEnv("TOODOO_API_KEY", "k"); });
const req = (method: string, path: string, body?: unknown, key = "k") => ({
  method, headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
  body: body === undefined ? undefined : JSON.stringify(body),
});

it("adds, dedupes and patches over REST", async () => {
  const t = convexTest(schema, modules);
  const task = { title: "From Trippn", source: "trippn", external_id: "trip:1" };
  const a = await t.fetch("/api/tasks", req("POST", "/api/tasks", task));
  expect(a.status).toBe(200);
  expect((await a.json()).created).toHaveLength(1);
  const b = await (await t.fetch("/api/tasks", req("POST", "/api/tasks", task))).json();
  expect(b.skipped).toHaveLength(1);
  const p = await t.fetch("/api/tasks/trippn/trip%3A1", req("PATCH", "", { done: true }));
  expect(await p.json()).toMatchObject({ done: true, done_on: expect.any(String) });
  expect((await t.fetch("/api/tasks/trippn/nope", req("PATCH", "", { done: true }))).status).toBe(404);
  expect((await t.fetch("/api/tasks", req("GET", "", undefined, "wrong"))).status).toBe(401);
  const rows = await t.run((ctx) => ctx.db.query("tasks").collect());
  expect(rows).toHaveLength(1);
  expect(rows[0].user_id).toBe("user_steve");
});

it("imports the artifact over REST", async () => {
  const t = convexTest(schema, modules);
  const row = (title: string, external_id: string) => ({
    title, description: null, note: null, link: null, source: "jira", external_id, due: "2026-10-01", time: null,
    priority: null, estimate_mins: null, tags: ["work"], done: false, done_on: null, sort_order: 1, created_at: "2026-10-01T00:00:00Z",
  });
  const body = {
    tasks: [row("A", "jira:A-1"), row("B", "jira:B-1")],
    days: [{ date: "2026-10-01", headline: "Hi", events: [] }],
    blocks: [
      { date: "2026-10-01", source: "jira", external_id: "jira:A-1", start: "09:00", mins: 30 },
      { date: "2026-10-01", source: "jira", external_id: "jira:GONE", start: "10:00", mins: 30 },
    ],
  };
  const res = await t.fetch("/api/import", req("POST", "", body));
  expect(await res.json()).toEqual({ tasks: 2, days: 1, blocks: 1, dropped: 1 });
});

it("files screenshots sent with update_task on the task", async () => {
  vi.stubEnv("CONVEX_SITE_URL", "https://toodoo.convex.site");
  const t = convexTest(schema, modules).withIdentity({ subject: "user_steve" });
  const id = await t.run((ctx) => ctx.db.insert("tasks", {
    user_id: "user_steve", title: "Shot", description: null, note: null, link: null, source: "you", external_id: null, due: null, time: null,
    priority: null, estimate_mins: null, tags: [], done: false, done_on: null, sort_order: 1, created_at: "2026-10-01T00:00:00Z", updated_at: 1,
  }));
  const call = (args: unknown) => t.fetch("/mcp", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "update_task", arguments: args } }),
  }).then((r) => r.json());
  const ok = await call({ id, images: [{ data: "iVBORw0KGgo=", name: "after.png" }, { data: "iVBORw0KGgo=" }] });
  expect(JSON.parse(ok.result.content[0].text)).toMatchObject({ id, images_attached: 2 });
  const bad = await call({ id, patch: { title: "Changed" }, images: [{ data: "nope!" }] });
  expect(bad.result.isError).toBe(true);
  const rows = await t.run(async (ctx) => ({
    files: await ctx.db.query("attachments").collect(), task: await ctx.db.get(id),
  }));
  expect(rows.files.map((f) => [f.name, f.type])).toEqual([["after.png", "image/png"], ["screenshot-2.png", "image/png"]]);
  expect(rows.task).toMatchObject({ title: "Shot", attachments: 2 }); // a bad picture changes nothing
});
