import { ConvexError } from "convex/values";
import type { AddResult } from "../shared/validation.ts";

export interface ApiOps {
  add(items: unknown[]): Promise<AddResult>;
  update(source: string, externalId: string, patch: unknown): Promise<unknown>;
  list(source: string | null): Promise<unknown[]>;
  importArtifact(body: unknown): Promise<unknown>;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export function safeEqual(a: string, b: string) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  if (x.length !== y.length) return false;
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}

function fail(e: unknown) {
  if (e instanceof ConvexError) {
    const d = e.data as { code?: string; message?: string };
    return json({ error: d.message ?? "error" }, d.code === "not_found" ? 404 : 422);
  }
  if (e instanceof SyntaxError) return json({ error: "invalid JSON" }, 400);
  if (e instanceof URIError) return json({ error: "bad path" }, 400);
  console.error(e);
  return json({ error: "internal error" }, 500);
}

export function createHandler(o: { apiKey: string; ops: ApiOps }) {
  return async (req: Request): Promise<Response> => {
    if (!o.apiKey) return json({ error: "API not configured" }, 503);
    const token = /^Bearer\s+(.+)$/i.exec(req.headers.get("authorization") ?? "")?.[1] ?? "";
    if (!safeEqual(token, o.apiKey)) return json({ error: "unauthorized" }, 401);
    const url = new URL(req.url);
    if (req.method === "POST" && /\/api\/import\/?$/.test(url.pathname)) {
      try {
        return json(await o.ops.importArtifact(await req.json()));
      } catch (e) {
        return fail(e);
      }
    }
    const m = /\/tasks(?:\/([^/]+)\/([^/]+))?\/?$/.exec(url.pathname);
    if (!m) return json({ error: "not found" }, 404);
    try {
      if (req.method === "POST" && !m[1]) {
        const body = await req.json();
        const items: unknown[] = Array.isArray(body?.tasks) ? body.tasks : [body];
        if (items.length > 100) return json({ error: "max 100 tasks per request" }, 400);
        const r = await o.ops.add(items);
        return json(r, !r.created.length && !r.skipped.length && r.errors.length ? 422 : 200);
      }
      if (req.method === "PATCH" && m[1]) {
        return json(await o.ops.update(decodeURIComponent(m[1]), decodeURIComponent(m[2]), await req.json()));
      }
      if (req.method === "GET" && !m[1]) return json(await o.ops.list(url.searchParams.get("source")));
      return json({ error: "method not allowed" }, 405);
    } catch (e) {
      return fail(e);
    }
  };
}
