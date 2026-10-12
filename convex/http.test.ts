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
