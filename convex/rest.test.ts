import { describe, expect, it, vi } from "vitest";
import { ConvexError } from "convex/values";
import { createHandler, safeEqual } from "./rest.ts";

const ops = () => ({
  add: vi.fn(async (items: unknown[]) => ({
    created: items.map((_, i) => ({ id: "x" + i, title: "t", source: "you", external_id: null })), skipped: [], errors: [],
  })),
  update: vi.fn(async () => ({ id: "t1" })),
  list: vi.fn(async () => [{ id: "t1" }]),
  importArtifact: vi.fn(async () => ({ ok: true })),
});
const req = (method: string, path: string, body?: unknown, key = "secret") =>
  new Request("http://localhost/api" + path, {
    method, headers: { authorization: `Bearer ${key}` }, body: body === undefined ? undefined : JSON.stringify(body),
  });

describe("api handler", () => {
  it("rejects a wrong key", async () => {
    const h = createHandler({ apiKey: "secret", ops: ops() });
    expect((await h(req("GET", "/tasks", undefined, "nope"))).status).toBe(401);
  });
  it("requires the Bearer scheme", async () => {
    const h = createHandler({ apiKey: "secret", ops: ops() });
    const bare = new Request("http://localhost/api/tasks", { headers: { authorization: "secret" } });
    expect((await h(bare)).status).toBe(401);
  });
  it("is disabled without a configured key", async () => {
    const h = createHandler({ apiKey: "", ops: ops() });
    expect((await h(req("GET", "/tasks", undefined, ""))).status).toBe(503);
  });
  it("adds one task or a batch", async () => {
    const o = ops();
    const h = createHandler({ apiKey: "secret", ops: o });
    await h(req("POST", "/tasks", { title: "One" }));
    await h(req("POST", "/tasks", { tasks: [{ title: "A" }, { title: "B" }] }));
    expect(o.add.mock.calls.map((c) => c[0].length)).toEqual([1, 2]);
  });
  it("caps batches at 100", async () => {
    const h = createHandler({ apiKey: "secret", ops: ops() });
    const res = await h(req("POST", "/tasks", { tasks: Array.from({ length: 101 }, () => ({ title: "x" })) }));
    expect(res.status).toBe(400);
  });
  it("patches by source and external id", async () => {
    const o = ops();
    const h = createHandler({ apiKey: "secret", ops: o });
    const res = await h(req("PATCH", "/tasks/trippn/trip%3A42", { done: true }));
    expect(res.status).toBe(200);
    expect(o.update).toHaveBeenCalledWith("trippn", "trip:42", { done: true });
  });
  it("maps not-found and bad JSON", async () => {
    const o = ops();
    o.update.mockRejectedValueOnce(new ConvexError({ code: "not_found", message: "task not found" }));
    const h = createHandler({ apiKey: "secret", ops: o });
    expect((await h(req("PATCH", "/tasks/a/b", { done: true }))).status).toBe(404);
    const bad = new Request("http://localhost/api/tasks", { method: "POST", headers: { authorization: "Bearer secret" }, body: "{" });
    expect((await h(bad)).status).toBe(400);
  });
  it("maps input errors to 422 with their message", async () => {
    const o = ops();
    o.add.mockRejectedValueOnce(new ConvexError({ code: "input", message: "title: Required" }));
    const h = createHandler({ apiKey: "secret", ops: o });
    const res = await h(req("POST", "/tasks", { title: "" }));
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "title: Required" });
  });
  it("answers 422 when every item is invalid", async () => {
    const o = ops();
    const body = { created: [], skipped: [], errors: [{ index: 0, error: "title: Required" }] };
    o.add.mockResolvedValueOnce(body as never);
    const h = createHandler({ apiKey: "secret", ops: o });
    const res = await h(req("POST", "/tasks", { title: "" }));
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual(body);
  });
  it("hides internal errors behind a 500", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const o = ops();
    o.add.mockRejectedValueOnce(new Error("relation does not exist"));
    const h = createHandler({ apiKey: "secret", ops: o });
    const res = await h(req("POST", "/tasks", { title: "x" }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "internal error" });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
  it("rejects a malformed percent-encoded path with 400", async () => {
    const h = createHandler({ apiKey: "secret", ops: ops() });
    expect((await h(req("PATCH", "/tasks/a/%E0%A4%A", { done: true }))).status).toBe(400);
  });
  it("routes POST /api/import to importArtifact", async () => {
    const o = ops();
    const h = createHandler({ apiKey: "secret", ops: o });
    const res = await h(req("POST", "/import", { a: 1 }));
    expect(res.status).toBe(200);
    expect(o.importArtifact).toHaveBeenCalledWith({ a: 1 });
  });
  it("lists by source", async () => {
    const o = ops();
    const h = createHandler({ apiKey: "secret", ops: o });
    await h(req("GET", "/tasks?source=trippn"));
    expect(o.list).toHaveBeenCalledWith("trippn");
  });
  it("compares keys in constant time shape", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "ab")).toBe(false);
  });
});
