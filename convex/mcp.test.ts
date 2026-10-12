// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { beforeEach, expect, it, vi } from "vitest";
import { handleRpc, TOOL_DEFS } from "./mcp";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
beforeEach(() => {
  vi.stubEnv("ALLOWED_USER_ID", "user_steve");
  vi.stubEnv("CONVEX_SITE_URL", "https://toodoo.convex.site");
  vi.stubEnv("WORKOS_AUTHKIT_DOMAIN", "https://toodoo.authkit.app");
});
const rpc = (method: string, params?: unknown, id: number | undefined = 1) => ({ jsonrpc: "2.0", id, method, params });

it("speaks the MCP basics", async () => {
  const noop = async () => ({});
  expect(await handleRpc(rpc("initialize", { protocolVersion: "2025-06-18" }), noop)).toMatchObject({
    result: { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "toodoo" } },
  });
  expect(await handleRpc({ jsonrpc: "2.0", method: "notifications/initialized" }, noop)).toBeNull();
  expect((await handleRpc(rpc("tools/list"), noop) as any).result.tools.map((t: any) => t.name)).toEqual(
    ["get_snapshot", "add_tasks", "update_task", "set_day", "suggest", "plan", "unplan"]);
  expect(await handleRpc(rpc("nope"), noop)).toMatchObject({ error: { code: -32601 } });
});

it("returns tool errors as isError results", async () => {
  const boom = async () => { throw new ConvexError({ code: "not_found", message: "task not found" }); };
  const r: any = await handleRpc(rpc("tools/call", { name: "update_task", arguments: {} }), boom);
  expect(r.result.isError).toBe(true);
  expect(JSON.parse(r.result.content[0].text)).toEqual({ error: "task not found" });
});

it("challenges unauthenticated callers with resource metadata", async () => {
  const t = convexTest(schema, modules);
  const res = await t.fetch("/mcp", { method: "POST", body: JSON.stringify(rpc("tools/list")) });
  expect(res.status).toBe(401);
  expect(res.headers.get("WWW-Authenticate")).toContain(
    'resource_metadata="https://toodoo.convex.site/.well-known/oauth-protected-resource"');
  const meta = await (await t.fetch("/.well-known/oauth-protected-resource", { method: "GET" })).json();
  expect(meta).toEqual({
    resource: "https://toodoo.convex.site/mcp",
    authorization_servers: ["https://toodoo.authkit.app"],
    bearer_methods_supported: ["header"],
  });
});

it("strips a trailing slash from the advertised authorization server", async () => {
  vi.stubEnv("WORKOS_AUTHKIT_DOMAIN", "https://toodoo.authkit.app/");
  const meta = await (await convexTest(schema, modules).fetch("/.well-known/oauth-protected-resource", { method: "GET" })).json();
  expect(meta.authorization_servers).toEqual(["https://toodoo.authkit.app"]);
});

it("runs tools as the signed-in user", async () => {
  const t = convexTest(schema, modules).withIdentity({ subject: "user_steve" });
  const call = (name: string, args: unknown) =>
    t.fetch("/mcp", { method: "POST", body: JSON.stringify(rpc("tools/call", { name, arguments: args })) }).then((r) => r.json());
  const added: any = await call("add_tasks", { tasks: [{ title: "Via MCP" }] });
  expect(JSON.parse(added.result.content[0].text).created).toHaveLength(1);
  const snap: any = await call("get_snapshot", {});
  expect(JSON.parse(snap.result.content[0].text).tasks.due.map((x: any) => x.title)).toContain("Via MCP");
  const bad: any = await call("update_task", { id: "garbage", patch: { done: true } });
  expect(bad.result.isError).toBe(true);
});

it("publishes working regex patterns", () => {
  const props = (name: string) => (TOOL_DEFS.find((t) => t.name === name) as any).inputSchema.properties;
  const d = new RegExp(props("get_snapshot").date.pattern);
  expect(d.test("2026-10-12")).toBe(true);
  expect(d.test("dd")).toBe(false);
  const hm = new RegExp(props("plan").from.pattern);
  expect(hm.test("09:00")).toBe(true);
  expect(hm.test("dd")).toBe(false);
});

it("falls back to the latest protocol version", async () => {
  const r: any = await handleRpc(rpc("initialize", { protocolVersion: "1999-01-01" }), async () => ({}));
  expect(r.result.protocolVersion).toBe("2025-11-25");
});
