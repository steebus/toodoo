import { httpRouter } from "convex/server";
import { api, internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import { httpAction } from "./_generated/server";
import { handleRpc } from "./mcp";
import { createHandler } from "./rest";

const http = httpRouter();

// ponytail: one env key mapped to ALLOWED_USER_ID; move to a hashed keys table for more users/keys
const rest = httpAction(async (ctx, req) =>
  createHandler({
    apiKey: process.env.ALLOWED_USER_ID ? process.env.TOODOO_API_KEY ?? "" : "",
    ops: {
      add: (items) => ctx.runMutation(internal.restOps.add, { items }),
      update: (source, external_id, patch) => ctx.runMutation(internal.restOps.update, { source, external_id, patch }),
      list: (source) => ctx.runQuery(internal.restOps.list, { source }),
      importArtifact: (body) => ctx.runMutation(internal.importArtifact.run, body as any),
    },
  })(req),
);
for (const method of ["GET", "POST", "PATCH"] as const) http.route({ pathPrefix: "/api/", method, handler: rest });

const pick = (a: any, keys: string[]) =>
  Object.fromEntries(keys.filter((k) => a?.[k] !== undefined).map((k) => [k, a[k]]));

function callTool(ctx: ActionCtx, name: string, a: any): Promise<unknown> {
  switch (name) {
    case "get_snapshot": return ctx.runQuery(api.agent.getSnapshot, { ...pick(a, ["date", "query"]), now: Date.now() });
    case "add_tasks": return ctx.runMutation(api.agent.addTasks, { tasks: Array.isArray(a?.tasks) ? a.tasks : [] });
    case "update_task": return ctx.runMutation(api.agent.updateTask, { id: String(a?.id ?? ""), patch: a?.patch ?? {} });
    case "set_day": return ctx.runMutation(api.agent.setDay, { day: a ?? {} });
    case "suggest": return ctx.runQuery(api.agent.suggest, { ...pick(a, ["date", "limit"]), now: Date.now() });
    case "plan": return ctx.runMutation(api.agent.plan, { ...pick(a, ["date", "task_ids", "from", "until", "mins", "commit"]), now: Date.now() });
    case "unplan": return ctx.runMutation(api.agent.unplan, { date: String(a?.date ?? ""), ...pick(a, ["task_ids"]) });
    case "list_epics": return ctx.runQuery(api.epics.list, {});
    case "save_epic": {
      const fields = pick(a, ["title", "description", "priority", "status", "colour"]);
      return a?.id
        ? ctx.runMutation(api.epics.update, { id: String(a.id), patch: fields })
        : ctx.runMutation(api.epics.create, { epic: fields });
    }
    default: throw new Error(`unknown tool: ${name}`);
  }
}

const metadataUrl = () => `${process.env.CONVEX_SITE_URL}/.well-known/oauth-protected-resource`;
const metadata = httpAction(async () => Response.json({
  resource: `${process.env.CONVEX_SITE_URL}/mcp`,
  authorization_servers: [process.env.WORKOS_AUTHKIT_DOMAIN?.replace(/\/+$/, "")],
  bearer_methods_supported: ["header"],
}));
http.route({ path: "/.well-known/oauth-protected-resource", method: "GET", handler: metadata });
http.route({ path: "/.well-known/oauth-protected-resource/mcp", method: "GET", handler: metadata });

http.route({
  path: "/mcp", method: "POST",
  handler: httpAction(async (ctx, req) => {
    const identity = await ctx.auth.getUserIdentity().catch(() => null);
    if (!identity) {
      return Response.json({ error: "unauthorized" }, {
        status: 401, headers: { "WWW-Authenticate": `Bearer resource_metadata="${metadataUrl()}"` },
      });
    }
    let msg;
    try { msg = await req.json(); } catch {
      return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } }, { status: 400 });
    }
    const res = await handleRpc(msg, (name, args) => callTool(ctx, name, args));
    return res ? Response.json(res) : new Response(null, { status: 202 });
  }),
});
http.route({
  path: "/mcp", method: "GET",
  handler: httpAction(async () => new Response(null, { status: 405, headers: { Allow: "POST" } })),
});

export default http;
