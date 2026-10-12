# toodoo Convex Pivot Implementation Plan (Plan 1b)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Each task names a **Model** for the implementer subagent. Reviewers use `sonnet`; the final whole-branch review uses `opus`.

**Goal:** Replace the Supabase backend from Plan 1 with Convex plus WorkOS AuthKit. Keep the shared planning and validation logic, the MCP tool surface, the REST API and the artifact import. `pnpm dev` runs against a local Convex backend.

**Architecture:**
- Pure TypeScript in `shared/` (planning, validation, snapshot) is imported by the web app, the Convex functions and the scripts.
- Convex owns storage and integrity:
  - `convex/model.ts` holds the data helpers, which take an explicit `userId`.
  - `convex/agent.ts` exposes the public, auth-guarded functions. The web app and the MCP server both use them.
  - `convex/restOps.ts` holds internal functions for the API key path.
  - `convex/http.ts` routes `/mcp` (a hand-written stateless JSON-RPC handler), `/.well-known/oauth-protected-resource`, `/api/tasks` and `/api/import`.
- Auth is WorkOS AuthKit. `convex/auth.config.ts` trusts both the web issuer and the AuthKit domain used for MCP access tokens. `requireUser` admits only `ALLOWED_USER_ID`.

**Tech Stack:** pnpm, TypeScript, Vite, React 19, Tailwind v4, Vitest, Convex (`convex`, `convex-test`, `@edge-runtime/vm`), `@workos-inc/authkit-react`, zod 4, tsx, GitHub Actions, Vercel.

**Spec:** `docs/superpowers/specs/2026-10-12-toodoo-pwa-design.md` (revised for Convex)

## Global Constraints

- **Timezone:** `Australia/Brisbane`, hard-coded in `shared/planning.ts`.
- **Single user:** every public Convex function calls `requireUser(ctx)`, which throws unless `identity.subject === process.env.ALLOWED_USER_ID`. Every stored document carries `user_id`.
- **Field names stay snake_case** (`user_id`, `external_id`, `estimate_mins`, `done_on`, `sort_order`, `task_id`). They match `shared/` types and the MCP output. **Ruling:** this overrides the spec's camelCase sketch, so the shared code and its tests stay unchanged.
- **Optional values are stored as `null`, not omitted.** This matches the shared types.
- **Idempotency:** agent and connector tasks are idempotent on `(user_id, source, external_id)`. `add_tasks` never overwrites an existing task.
- **Text limits:** title ≤300, note ≤500, description ≤2000. Block `mins` 15–1440. Snap 15. Timeline 06:00–22:00.
- **`plan` never writes unless `commit: true`.** `unplan` with `task_ids: []` is a no-op.
- **Errors:** shared code throws `InputError`. Convex functions convert it to `ConvexError({code: "input" | "not_found", message})`, because Convex only forwards `ConvexError` data to callers.
- **MCP transport:** a hand-written stateless JSON-RPC handler. **Ruling:** this replaces the spec's SDK-first spike. It avoids a runtime-compatibility risk and a dependency, at the cost of about 100 lines.
- **`shared/*.ts`:** relative imports use the `.ts` extension. The only bare import allowed is `zod`.
- **Env vars on each Convex deployment:**
  - `WORKOS_CLIENT_ID`
  - `WORKOS_AUTHKIT_DOMAIN` (e.g. `https://xyz.authkit.app`)
  - `ALLOWED_USER_ID`
  - `TOODOO_API_KEY`
  - `APP_URL`

  `CONVEX_SITE_URL` is built in. The MCP resource URL is `${CONVEX_SITE_URL}/mcp`.
- **UI copy:** little to no explainer text.
- **Commits:** each agent uses the `Co-Authored-By` trailer its harness gives it.

## Review Focus

1. **Cross-user access.** A valid WorkOS token for a different user (or no token) must be rejected by every public function and by `/mcp`. Tests in Tasks 2, 3 and 5.
2. **Duplicates.** Re-sending the same `source + external_id`, both in one batch and across calls (agent and REST), never creates a second task. Tests in Tasks 3 and 4.
3. **Orphaned blocks.** Deleting a task must leave no plan blocks pointing at it. Test in Task 3.
4. **Invalid identifiers from Claude.** A garbage `id` in `update_task`, or garbage `task_ids` in `plan`/`unplan`, gives a clean "task not found" or no-op, never a crash. Tests in Tasks 3 and 5.
5. **Re-running the import.** It changes no counts, and blocks whose task is missing are dropped and reported. Test in Task 7.

---

## File Structure

```
shared/planning.ts (+ .test.ts)        moved from supabase/functions/_shared, unchanged
shared/validation.ts (+ .test.ts)      from _shared/tasks.ts: zod + pure prepareTasks/preparePatch/parseDay
shared/snapshot.ts (+ .test.ts)        buildSnapshot + types (loadState removed)
convex/schema.ts                       tables + indexes
convex/auth.config.ts                  WorkOS web issuer + AuthKit MCP issuer
convex/lib/user.ts                     requireUser
convex/me.ts                           whoami query
convex/model.ts                        data helpers (db, userId) used by agent/restOps/import
convex/agent.ts                        public auth-guarded queries/mutations (web + MCP)
convex/restOps.ts                      internal functions acting as ALLOWED_USER_ID
convex/rest.ts (+ .test.ts)            REST handler factory (moved from supabase/functions/api/handler.ts)
convex/mcp.ts (+ .test.ts)             JSON-RPC handler + tool definitions
convex/importArtifact.ts               internal import mutation
convex/http.ts                         routes
convex/*.test.ts                       convex-test suites
apps/web/src/{main.tsx,App.tsx,ConvexProviderWithAuthKit.tsx,App.test.tsx}
scripts/artifact-map.ts (+ .test.ts), scripts/import-artifact.ts
.github/workflows/ci.yml, vercel.json, docs/setup.md, .env.example
```

---

### Task 1: Remove Supabase and move shared code

**Model:** haiku

**Files:**
- Move: `supabase/functions/_shared/planning.ts`, `planning.test.ts`, `snapshot.ts`, `snapshot.test.ts` go to `shared/`
- Create: `shared/validation.ts`, `shared/validation.test.ts` (from `_shared/tasks.ts` and `tasks.test.ts`)
- Delete: `supabase/` (whole folder), `scripts/import-artifact.ts` (rewritten in Task 7)
- Modify: `package.json`, `tsconfig.json`, `vitest.config.ts`, `pnpm-workspace.yaml`, `.gitignore`, `scripts/artifact-map.ts` (import path), `apps/web/vite.config.ts` and `apps/web/tsconfig.json` (`@shared` alias → `../../shared`)

**Interfaces:**
- Produces, in `shared/validation.ts`, everything `tasks.ts` exported except the Supabase writers:
  - `InputError`, `normTag`, `parseTags`, `normPriority`, `normLink`
  - `TaskInput`, `TaskPatch`, `DayInput`, `issuesText`
  - `AddResult`
- Plus three new pure functions:
  - `interface TaskRow { title: string; description: string|null; note: string|null; link: string|null; source: string; external_id: string|null; due: string; time: string|null; priority: Priority|null; estimate_mins: number|null; tags: string[] }`
  - `prepareTasks(inputs: unknown[], today: string): { rows: TaskRow[]; skipped: AddResult["skipped"]; errors: AddResult["errors"] }`
  - `preparePatch(patch: unknown, today: string): Record<string, unknown>`, which throws `InputError`
  - `parseDay(input: unknown): { date: string; headline?: string|null; events?: {start?: string; end?: string; title: string; where?: string; allDay?: boolean}[] }`, which throws `InputError`
- Produces, in `shared/snapshot.ts`: `FullTask`, `DayRow`, `State`, `buildSnapshot`, with no `loadState`.

- [ ] **Step 1: Move files with git**

```bash
mkdir -p shared
git mv supabase/functions/_shared/planning.ts shared/planning.ts
git mv supabase/functions/_shared/planning.test.ts shared/planning.test.ts
git mv supabase/functions/_shared/snapshot.ts shared/snapshot.ts
git mv supabase/functions/_shared/snapshot.test.ts shared/snapshot.test.ts
git mv supabase/functions/_shared/tasks.ts shared/validation.ts
git mv supabase/functions/_shared/tasks.test.ts shared/validation.test.ts
git rm -r -q supabase scripts/import-artifact.ts
```

- [ ] **Step 2: Make `shared/validation.ts` pure**

Delete the `SupabaseClient` import and the `addTasks`, `updateTask` and `setDay` functions. Keep everything above them unchanged, then append:

```ts
export interface TaskRow {
  title: string; description: string | null; note: string | null; link: string | null;
  source: string; external_id: string | null; due: string; time: string | null;
  priority: Priority | null; estimate_mins: number | null; tags: string[];
}

// Validates and normalises a batch; duplicates inside the batch are reported as skipped.
export function prepareTasks(inputs: unknown[], today: string) {
  const errors: AddResult["errors"] = [];
  const skipped: AddResult["skipped"] = [];
  const rows: TaskRow[] = [];
  const seen = new Set<string>();
  inputs.forEach((raw, index) => {
    const r = TaskInput.safeParse(raw);
    if (!r.success) { errors.push({ index, error: issuesText(r.error) }); return; }
    const v = r.data;
    const source = v.source ?? "you";
    const external_id = v.external_id ?? null;
    if (external_id) {
      const k = source + "\u0000" + external_id;
      if (seen.has(k)) { skipped.push({ title: v.title, source, external_id }); return; }
      seen.add(k);
    }
    rows.push({
      title: v.title, description: v.description ?? null, note: v.note ?? null, link: v.link ?? null,
      source, external_id, due: v.due ?? today, time: v.time ?? null, priority: v.priority ?? null,
      estimate_mins: v.estimate_mins ?? null, tags: v.tags ?? [],
    });
  });
  return { rows, skipped, errors };
}

export function preparePatch(patch: unknown, today: string): Record<string, unknown> {
  const r = TaskPatch.safeParse(patch);
  if (!r.success) throw new InputError(issuesText(r.error));
  const p: Record<string, unknown> = defined(r.data);
  if (p.done === true && !p.done_on) p.done_on = today;
  if (p.done === false) p.done_on = null;
  if (!Object.keys(p).length) throw new InputError("nothing to update");
  return p;
}

export function parseDay(input: unknown) {
  const r = DayInput.safeParse(input);
  if (!r.success) throw new InputError(issuesText(r.error));
  return defined(r.data) as z.infer<typeof DayInput>;
}
```

- [ ] **Step 3: Port the tests**

In `shared/validation.test.ts`, change the import to `./validation.ts`. Keep the normaliser, TaskPatch and DayInput tests as they are. Replace every `addTasks`/`updateTask` test, which used fake Supabase clients, with equivalent pure tests:
- **`prepareTasks` normalising:** the old "normalises, defaults due to today and reports per-item errors" case. Assert that `rows` equals the expected row (the same object as before) and that the error indexes are `[1, 2]`.
- **`prepareTasks` duplicates:** a batch of `A jira:X-1`, `B jira:X-2`, `B again jira:X-2` gives rows `["A","B"]` and skipped `["B again"]`.
- **`prepareTasks` impossible values:** the old "due 2026-02-31 / time 24:00" case. The bad items land in `errors` at the same indexes, and only the valid row is in `rows`.
- **`preparePatch`:**
  - `{done:true}` gives `{done:true, done_on:"2026-10-12"}`
  - `{done:false}` gives `{done:false, done_on:null}`
  - `{}` throws "nothing to update"
  - `{due:"2026-02-31"}` throws `InputError`
- **Dropped:** the "missing task match" test, because matching moves to Convex.

In `shared/snapshot.ts`, delete `loadState`, `HISTORY_DAYS` and the `SupabaseClient` import. Keep the types and `buildSnapshot`.

In `scripts/artifact-map.ts`, change the import to `../shared/validation.ts`.

- [ ] **Step 4: Root config**

`package.json` scripts become the following. Tasks 2 and 6 fill in `dev`.
```json
{
  "dev": "pnpm --filter @toodoo/web dev",
  "dev:cloud": "pnpm --filter @toodoo/web dev",
  "build": "pnpm --filter @toodoo/web build",
  "test": "vitest run && pnpm --filter @toodoo/web test",
  "typecheck": "tsc -p tsconfig.json && pnpm --filter @toodoo/web typecheck"
}
```
Then:
- `pnpm remove -w supabase @supabase/supabase-js`.
- In `pnpm-workspace.yaml`, remove `supabase` from `onlyBuiltDependencies`.
- `tsconfig.json` `include`: `["shared/**/*.ts", "scripts/**/*.ts", "vitest.config.ts"]`, and remove `exclude`.
- `vitest.config.ts` `include`: `["shared/**/*.test.ts", "scripts/**/*.test.ts", "convex/**/*.test.ts"]`.
- `.gitignore`: add `.convex` and `.env.local`.
- Web alias: in `apps/web/vite.config.ts` and `apps/web/tsconfig.json`, point `@shared` at `../../shared`.

The web app still imports `@supabase/supabase-js` from its own package. Leave it; Task 6 replaces it.

- [ ] **Step 5: Verify**

Run: `pnpm vitest run` and expect all shared and script tests to pass. Run `pnpm tsc -p tsconfig.json` and expect it clean. Run `pnpm --filter @toodoo/web test` and expect it to pass.

- [ ] **Step 6: Commit**

```bash
git add -A shared scripts package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json vitest.config.ts .gitignore apps/web/vite.config.ts apps/web/tsconfig.json
git commit -m "refactor: drop Supabase, move pure shared logic to shared/"
```
Run `git status` first. The `git rm` deletions are already staged.

---

### Task 2: Convex project, schema, auth config, requireUser

**Model:** sonnet

**Files:**
- Create: `convex/schema.ts`, `convex/auth.config.ts`, `convex/lib/user.ts`, `convex/me.ts`, `convex/user.test.ts`, `convex/_generated/*` (generated, committed), `convex/tsconfig.json` (generated)
- Modify: `package.json`, `vitest.config.ts`

**Interfaces:**
- Produces:
  - `requireUser(ctx: { auth: Auth }): Promise<string>`, which throws `ConvexError({code:"unauthenticated"|"forbidden", message})`.
  - `api.me.me` (query → the user id).
  - The table and index names below, used by every later task.

- [ ] **Step 1: Install and create a local anonymous deployment**

```bash
pnpm add -w convex
pnpm add -Dw convex-test @edge-runtime/vm
```
Create `convex/schema.ts` (Step 2) first, then run `CONVEX_AGENT_MODE=anonymous pnpm convex dev --once`. This creates a local anonymous deployment with no account, generates `convex/_generated` and `convex/tsconfig.json`, and writes `.env.local` (gitignored). Record in the report:
- what it wrote to `.env.local` (`CONVEX_DEPLOYMENT`, `CONVEX_URL`, maybe `CONVEX_SITE_URL`);
- the local site URL. Local HTTP actions are usually served on port 3211.

Then set placeholder env vars, so `auth.config.ts` and `requireUser` have values:
```bash
pnpm convex env set WORKOS_CLIENT_ID client_placeholder
pnpm convex env set WORKOS_AUTHKIT_DOMAIN https://placeholder.authkit.app
pnpm convex env set ALLOWED_USER_ID user_local
pnpm convex env set TOODOO_API_KEY local-dev-key
pnpm convex env set APP_URL http://localhost:5173
```

- [ ] **Step 2: Schema**

`convex/schema.ts`:
```ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const str = v.union(v.string(), v.null());
const event = v.object({
  start: v.optional(v.string()), end: v.optional(v.string()), title: v.string(),
  where: v.optional(v.string()), allDay: v.optional(v.boolean()),
});

export default defineSchema({
  tasks: defineTable({
    user_id: v.string(),
    title: v.string(),
    description: str,
    note: str,
    link: str,
    source: v.string(),
    external_id: str,
    due: v.string(),
    time: str,
    priority: v.union(v.literal("high"), v.literal("med"), v.literal("low"), v.null()),
    estimate_mins: v.union(v.number(), v.null()),
    tags: v.array(v.string()),
    done: v.boolean(),
    done_on: str,
    sort_order: v.number(),
    created_at: v.string(),
    updated_at: v.number(),
  })
    .index("by_user_done", ["user_id", "done"])
    .index("by_user_source_ext", ["user_id", "source", "external_id"])
    .index("by_user_done_on", ["user_id", "done_on"]),
  days: defineTable({ user_id: v.string(), date: v.string(), headline: str, events: v.array(event) })
    .index("by_user_date", ["user_id", "date"]),
  plan_blocks: defineTable({
    user_id: v.string(), date: v.string(), task_id: v.id("tasks"), start: v.string(), mins: v.number(),
  })
    .index("by_user_date", ["user_id", "date"])
    .index("by_task", ["task_id"]),
});
```

- [ ] **Step 3: Auth config**

`convex/auth.config.ts`:
```ts
import type { AuthConfig } from "convex/server";

const clientId = process.env.WORKOS_CLIENT_ID;
const authkit = process.env.WORKOS_AUTHKIT_DOMAIN; // e.g. https://xyz.authkit.app

export default {
  providers: [
    // Web app sign-in (from Convex's AuthKit template)
    { type: "customJwt", issuer: "https://api.workos.com/", algorithm: "RS256",
      jwks: `https://api.workos.com/sso/jwks/${clientId}`, applicationID: clientId },
    { type: "customJwt", issuer: `https://api.workos.com/user_management/${clientId}`, algorithm: "RS256",
      jwks: `https://api.workos.com/sso/jwks/${clientId}` },
    // MCP access tokens AuthKit issues to Claude: audience is this deployment's /mcp resource
    { type: "customJwt", issuer: authkit!, algorithm: "RS256",
      jwks: `${authkit}/oauth2/jwks`, applicationID: `${process.env.CONVEX_SITE_URL}/mcp` },
  ],
} satisfies AuthConfig;
```

- [ ] **Step 4: requireUser and the `me` query**

`convex/lib/user.ts`:
```ts
import type { Auth } from "convex/server";
import { ConvexError } from "convex/values";

// ponytail: single allowed user; replace with membership checks if multi-user
export async function requireUser(ctx: { auth: Auth }): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError({ code: "unauthenticated", message: "sign in required" });
  if (!process.env.ALLOWED_USER_ID || identity.subject !== process.env.ALLOWED_USER_ID) {
    throw new ConvexError({ code: "forbidden", message: "not allowed" });
  }
  return identity.subject;
}
```

`convex/me.ts`:
```ts
import { query } from "./_generated/server";
import { requireUser } from "./lib/user";

export const me = query({ args: {}, handler: (ctx) => requireUser(ctx) });
```

- [ ] **Step 5: Write the test**

`convex/user.test.ts`:
```ts
// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { beforeEach, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
beforeEach(() => { vi.stubEnv("ALLOWED_USER_ID", "user_steve"); });

it("rejects anonymous callers", async () => {
  await expect(convexTest(schema, modules).query(api.me.me, {})).rejects.toThrow(/sign in required/);
});
it("rejects other users", async () => {
  const t = convexTest(schema, modules).withIdentity({ subject: "user_other" });
  await expect(t.query(api.me.me, {})).rejects.toThrow(/not allowed/);
});
it("admits the allowed user", async () => {
  const t = convexTest(schema, modules).withIdentity({ subject: "user_steve" });
  expect(await t.query(api.me.me, {})).toBe("user_steve");
});
```
Add `server: { deps: { inline: ["convex-test"] } }` to the root `vitest.config.ts` `test` block if convex-test fails to load without it. Re-run `CONVEX_AGENT_MODE=anonymous pnpm convex dev --once` after adding `me.ts`, so `_generated/api` includes it. If `vi.stubEnv` is not visible inside convex-test functions, report the exact behaviour and set `process.env.ALLOWED_USER_ID` directly in `beforeEach`.

Run: `pnpm vitest run convex/user` and expect 3 passing tests.

- [ ] **Step 6: dev scripts**

Set the root scripts. Verify the flags against `pnpm convex dev --help` and `pnpm convex deployment --help`. If a flag differs, use the real one and note it.
```json
"dev": "convex deployment select local && convex dev --start \"pnpm --filter @toodoo/web dev\"",
"dev:cloud": "convex deployment select dev && convex dev --start \"pnpm --filter @toodoo/web dev\""
```
If `deployment select` needs a logged-in account and fails anonymously, set `"dev": "convex dev --start \"pnpm --filter @toodoo/web dev\""`, keep `dev:cloud` as written, and say so in the report. Steve logs in later.

- [ ] **Step 7: Verify and commit**

`pnpm vitest run` all green; `pnpm tsc -p tsconfig.json` clean, and `pnpm tsc -p convex` clean if it has its own tsconfig.
```bash
git add convex package.json pnpm-lock.yaml vitest.config.ts
git commit -m "feat(convex): schema, AuthKit auth config and requireUser"
```
Never commit `.env.local` or `.convex/`.

---

### Task 3: Data helpers and public agent functions

**Model:** sonnet

**Files:**
- Create: `convex/model.ts`, `convex/agent.ts`, `convex/agent.test.ts`

**Interfaces:**
- Consumes: `shared/*`, `requireUser`, the schema.
- Produces in `convex/model.ts`:
  - `clock(now?)`, `asConvexError(e)`
  - `loadState(db, userId, today, date)`
  - `snapshot(db, userId, {date?, query?}, now?)`
  - `addTasks(db, userId, inputs, today)`
  - `updateTask(db, userId, find, patch, today)`
  - `setDay(db, userId, input)`
  - `deleteTask(db, userId, id)`
  - `suggestNext(db, userId, {date?, limit?}, now?)`
  - `planDay(db, userId, args, now?)`
  - `unplan(db, userId, date, taskIds?)`
  - `listBySource(db, userId, source)`
- Produces in `convex/agent.ts`: `getSnapshot`, `suggest` (queries), and `addTasks`, `updateTask`, `setDay`, `plan`, `unplan`, `deleteTask` (mutations).

- [ ] **Step 1: Write the failing tests**

`convex/agent.test.ts`:
```ts
// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const setup = () => convexTest(schema, modules).withIdentity({ subject: "user_steve" });

beforeEach(() => {
  vi.stubEnv("ALLOWED_USER_ID", "user_steve");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-12T02:00:00Z")); // 12:00 Brisbane
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

it("adds tasks idempotently on source + external_id", async () => {
  const t = setup();
  const input = [{ title: "Review PR", source: "jira", external_id: "jira:T-1" }, { title: "Mine" }, { title: "" }];
  const first = await t.mutation(api.agent.addTasks, { tasks: input });
  expect(first.created.map((c) => c.title)).toEqual(["Review PR", "Mine"]);
  expect(first.errors.map((e) => e.index)).toEqual([2]);
  const second = await t.mutation(api.agent.addTasks, { tasks: input.slice(0, 1) });
  expect(second.created).toEqual([]);
  expect(second.skipped).toEqual([{ title: "Review PR", source: "jira", external_id: "jira:T-1" }]);
});

it("requires the allowed user", async () => {
  const anon = convexTest(schema, modules);
  await expect(anon.mutation(api.agent.addTasks, { tasks: [{ title: "x" }] })).rejects.toThrow(/sign in required/);
});

it("ticks a task and reports unknown ids cleanly", async () => {
  const t = setup();
  const { created } = await t.mutation(api.agent.addTasks, { tasks: [{ title: "Tick me", priority: "high" }] });
  const done = await t.mutation(api.agent.updateTask, { id: created[0].id, patch: { done: true } });
  expect(done).toMatchObject({ done: true, done_on: "2026-10-12", priority: "high" });
  await expect(t.mutation(api.agent.updateTask, { id: "nonsense", patch: { done: true } })).rejects.toThrow(/task not found/);
});

it("deleting a task deletes its blocks", async () => {
  const t = setup();
  const { created } = await t.mutation(api.agent.addTasks, { tasks: [{ title: "Block me" }] });
  await t.mutation(api.agent.plan, { from: "13:00", until: "17:00", commit: true });
  await t.mutation(api.agent.deleteTask, { id: created[0].id });
  const left = await t.run((ctx) => ctx.db.query("plan_blocks").collect());
  expect(left).toEqual([]);
});

it("plans only on commit, and unplans", async () => {
  const t = setup();
  await t.mutation(api.agent.addTasks, { tasks: [{ title: "Deep work", priority: "high" }] });
  const preview = await t.mutation(api.agent.plan, { from: "13:00", until: "17:00" });
  expect(preview).toMatchObject({ committed: false, proposed: [{ title: "Deep work", start: "13:00", mins: 60 }] });
  expect(await t.run((ctx) => ctx.db.query("plan_blocks").collect())).toHaveLength(0);
  const saved = await t.mutation(api.agent.plan, { from: "13:00", until: "17:00", commit: true });
  expect(saved.committed).toBe(true);
  expect(await t.mutation(api.agent.unplan, { date: "2026-10-12", task_ids: [] })).toEqual({ removed: 0 });
  expect(await t.mutation(api.agent.unplan, { date: "2026-10-12", task_ids: ["garbage"] })).toEqual({ removed: 0 });
  expect(await t.mutation(api.agent.unplan, { date: "2026-10-12" })).toEqual({ removed: 1 });
});

it("snapshot shows today's tasks, the day and the plan", async () => {
  const t = setup();
  await t.mutation(api.agent.addTasks, { tasks: [{ title: "Today thing" }] });
  await t.mutation(api.agent.setDay, { day: { date: "2026-10-12", headline: "Clear arvo", events: [{ start: "9:15", end: "09:30", title: "Standup" }] } });
  const s = await t.query(api.agent.getSnapshot, {});
  expect(s.today).toBe("2026-10-12");
  expect(s.tasks.due.map((x) => x.title)).toEqual(["Today thing"]);
  expect(s.day).toMatchObject({ headline: "Clear arvo", events: [{ start: "09:15", title: "Standup" }] });
});
```
Run: `pnpm vitest run convex/agent` and expect it to fail because `api.agent` doesn't exist.

- [ ] **Step 2: Implement `convex/model.ts`**

```ts
import { ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { addDays, autoPlan, busySpans, firstFree, nowMin, snapUp, suggestions, toHM, toMin, today } from "../shared/planning.ts";
import { buildSnapshot, type FullTask, type State } from "../shared/snapshot.ts";
import { type AddResult, InputError, parseDay, preparePatch, prepareTasks } from "../shared/validation.ts";

type R = QueryCtx["db"];
type W = MutationCtx["db"];
const HISTORY_DAYS = 90; // ponytail: effort/suggestions look back 90 days; widen if older plans matter

export const clock = (now = new Date()) => ({ t: today(now), nowM: nowMin(now) });

// Shared code throws InputError; Convex only forwards ConvexError data to callers.
export function asConvexError(e: unknown): never {
  if (e instanceof InputError) {
    throw new ConvexError({ code: e.message === "task not found" ? "not_found" : "input", message: e.message });
  }
  throw e;
}

const toTask = (d: Doc<"tasks">): FullTask => ({
  id: d._id, title: d.title, due: d.due, time: d.time, priority: d.priority, estimate_mins: d.estimate_mins,
  done: d.done, done_on: d.done_on, sort_order: d.sort_order, source: d.source, external_id: d.external_id,
  tags: d.tags, link: d.link, note: d.note, description: d.description,
});

async function ownedTask(db: R, userId: string, id: string) {
  const nid = db.normalizeId("tasks", id);
  const doc = nid ? await db.get(nid) : null;
  return doc && doc.user_id === userId ? doc : null;
}

export async function loadState(db: R, userId: string, t: string, date: string): Promise<State> {
  const lo = addDays(date < t ? date : t, -1);
  const open = await db.query("tasks").withIndex("by_user_done", (q) => q.eq("user_id", userId).eq("done", false)).collect();
  const done = await db.query("tasks").withIndex("by_user_done_on", (q) => q.eq("user_id", userId).gte("done_on", lo)).collect();
  const days = await db.query("days")
    .withIndex("by_user_date", (q) => q.eq("user_id", userId).gte("date", lo).lte("date", addDays(date, 1))).collect();
  const blocks = await db.query("plan_blocks")
    .withIndex("by_user_date", (q) => q.eq("user_id", userId).gte("date", addDays(t, -HISTORY_DAYS))).collect();
  return {
    tasks: [...open, ...done.filter((d) => d.done)].map(toTask),
    days: days.map((d) => ({ date: d.date, headline: d.headline, events: d.events })),
    blocks: blocks.map((b) => ({ task_id: b.task_id, date: b.date, start: b.start, mins: b.mins })),
  };
}

export async function snapshot(db: R, userId: string, a: { date?: string; query?: string }, now = new Date()) {
  const { t, nowM } = clock(now);
  const date = a.date ?? t;
  return {
    app_url: process.env.APP_URL ?? null,
    ...buildSnapshot({ date, today: t, nowM, query: a.query, ...(await loadState(db, userId, t, date)) }),
  };
}

export async function addTasks(db: W, userId: string, inputs: unknown[], t: string): Promise<AddResult> {
  const { rows, skipped, errors } = prepareTasks(inputs, t);
  const created: AddResult["created"] = [];
  const now = Date.now();
  for (const [i, r] of rows.entries()) {
    if (r.external_id) {
      const hit = await db.query("tasks").withIndex("by_user_source_ext", (q) =>
        q.eq("user_id", userId).eq("source", r.source).eq("external_id", r.external_id)).first();
      if (hit) { skipped.push({ title: r.title, source: r.source, external_id: r.external_id }); continue; }
    }
    const id = await db.insert("tasks", {
      ...r, user_id: userId, done: false, done_on: null,
      sort_order: now / 1000 + i / 1000, created_at: new Date(now).toISOString(), updated_at: now,
    });
    created.push({ id, title: r.title, source: r.source, external_id: r.external_id });
  }
  return { created, skipped, errors };
}

export async function updateTask(
  db: W, userId: string, find: { id: string } | { source: string; external_id: string }, patch: unknown, t: string,
) {
  const p = preparePatch(patch, t);
  const doc = "id" in find
    ? await ownedTask(db, userId, find.id)
    : await db.query("tasks").withIndex("by_user_source_ext", (q) =>
        q.eq("user_id", userId).eq("source", find.source).eq("external_id", find.external_id)).first();
  if (!doc) throw new InputError("task not found");
  await db.patch(doc._id, { ...(p as Partial<Doc<"tasks">>), updated_at: Date.now() });
  const d = (await db.get(doc._id))!;
  return { id: d._id, title: d.title, due: d.due, time: d.time, priority: d.priority, done: d.done, done_on: d.done_on, tags: d.tags };
}

export async function setDay(db: W, userId: string, input: unknown) {
  const d = parseDay(input);
  const hit = await db.query("days").withIndex("by_user_date", (q) => q.eq("user_id", userId).eq("date", d.date)).first();
  const headline = d.headline === undefined ? hit?.headline ?? null : d.headline ?? null;
  const events = d.events ?? hit?.events ?? [];
  if (hit) await db.patch(hit._id, { headline, events });
  else await db.insert("days", { user_id: userId, date: d.date, headline, events });
  return { date: d.date, headline, events };
}

export async function deleteTask(db: W, userId: string, id: string) {
  const doc = await ownedTask(db, userId, id);
  if (!doc) throw new InputError("task not found");
  for (const b of await db.query("plan_blocks").withIndex("by_task", (q) => q.eq("task_id", doc._id)).collect()) {
    await db.delete(b._id);
  }
  await db.delete(doc._id);
  return { deleted: id };
}

export async function suggestNext(db: R, userId: string, a: { date?: string; limit?: number }, now = new Date()) {
  const { t, nowM } = clock(now);
  const date = a.date ?? t;
  const s = await loadState(db, userId, t, date);
  const events = s.days.find((d) => d.date === date)?.events ?? [];
  const free = date === t ? firstFree(15, snapUp(nowM), busySpans(events, s.blocks, date)) : null;
  return {
    date,
    suggestions: suggestions({ date, today: t, nowM, tasks: s.tasks, blocks: s.blocks, limit: a.limit ?? 5 })
      .map((x) => ({ id: x.task.id, title: x.task.title, reasons: x.reasons, estimate_mins: x.task.estimate_mins })),
    next_free: free == null ? null : toHM(free),
  };
}

export async function planDay(
  db: W, userId: string,
  a: { date?: string; task_ids?: string[]; from?: string; until?: string; commit?: boolean }, now = new Date(),
) {
  const { t, nowM } = clock(now);
  const date = a.date ?? t;
  const s = await loadState(db, userId, t, date);
  const r = autoPlan({
    date, today: t, nowM, tasks: s.tasks, blocks: s.blocks,
    events: s.days.find((d) => d.date === date)?.events ?? [],
    from: toMin(a.from) ?? undefined, until: toMin(a.until) ?? undefined, taskIds: a.task_ids,
  });
  if (a.commit) {
    for (const p of r.proposed) {
      const taskId = p.task_id as Id<"tasks">;
      const existing = (await db.query("plan_blocks").withIndex("by_task", (q) => q.eq("task_id", taskId)).collect())
        .find((b) => b.date === date);
      if (existing) await db.patch(existing._id, { start: p.start, mins: p.mins });
      else await db.insert("plan_blocks", { user_id: userId, date, task_id: taskId, start: p.start, mins: p.mins });
    }
  }
  return { date, committed: !!a.commit && r.proposed.length > 0, ...r };
}

export async function unplan(db: W, userId: string, date: string, taskIds?: string[]) {
  if (taskIds && !taskIds.length) return { removed: 0 };
  const blocks = await db.query("plan_blocks").withIndex("by_user_date", (q) => q.eq("user_id", userId).eq("date", date)).collect();
  const doomed = taskIds ? blocks.filter((b) => taskIds.includes(b.task_id)) : blocks;
  for (const b of doomed) await db.delete(b._id);
  return { removed: doomed.length };
}

export async function listBySource(db: R, userId: string, source: string | null) {
  const all = [
    ...(await db.query("tasks").withIndex("by_user_done", (q) => q.eq("user_id", userId).eq("done", false)).collect()),
    ...(await db.query("tasks").withIndex("by_user_done", (q) => q.eq("user_id", userId).eq("done", true)).order("desc").take(200)),
  ];
  return all.filter((d) => !source || d.source === source).slice(0, 500).map((d) => ({
    id: d._id, title: d.title, source: d.source, external_id: d.external_id, due: d.due, time: d.time,
    priority: d.priority, done: d.done, done_on: d.done_on, tags: d.tags, link: d.link,
  }));
}
```

- [ ] **Step 3: Implement `convex/agent.ts`**

```ts
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./lib/user";
import * as m from "./model";

const date = v.optional(v.string());
const ids = v.optional(v.array(v.string()));

export const getSnapshot = query({
  args: { date, query: v.optional(v.string()) },
  handler: async (ctx, a) => m.snapshot(ctx.db, await requireUser(ctx), a),
});
export const suggest = query({
  args: { date, limit: v.optional(v.number()) },
  handler: async (ctx, a) => m.suggestNext(ctx.db, await requireUser(ctx), a),
});
export const addTasks = mutation({
  args: { tasks: v.array(v.any()) },
  handler: async (ctx, a) => m.addTasks(ctx.db, await requireUser(ctx), a.tasks, m.clock().t),
});
export const updateTask = mutation({
  args: { id: v.string(), patch: v.any() },
  handler: async (ctx, a) =>
    m.updateTask(ctx.db, await requireUser(ctx), { id: a.id }, a.patch, m.clock().t).catch(m.asConvexError),
});
export const setDay = mutation({
  args: { day: v.any() },
  handler: async (ctx, a) => m.setDay(ctx.db, await requireUser(ctx), a.day).catch(m.asConvexError),
});
export const deleteTask = mutation({
  args: { id: v.string() },
  handler: async (ctx, a) => m.deleteTask(ctx.db, await requireUser(ctx), a.id).catch(m.asConvexError),
});
export const plan = mutation({
  args: { date, task_ids: ids, from: v.optional(v.string()), until: v.optional(v.string()), commit: v.optional(v.boolean()) },
  handler: async (ctx, a) => m.planDay(ctx.db, await requireUser(ctx), a),
});
export const unplan = mutation({
  args: { date: v.string(), task_ids: ids },
  handler: async (ctx, a) => m.unplan(ctx.db, await requireUser(ctx), a.date, a.task_ids),
});
```
Regenerate the types with `CONVEX_AGENT_MODE=anonymous pnpm convex dev --once`.

- [ ] **Step 4: Verify**

Run `pnpm vitest run convex` and expect all tests to pass. If faked `Date` doesn't reach convex-test functions, add an optional `now` arg to `plan`/`getSnapshot`/`suggest` only, rather than changing `model.ts`'s contract, and report it. Then run `pnpm tsc -p tsconfig.json` and the convex tsconfig check.

- [ ] **Step 5: Commit**

```bash
git add convex
git commit -m "feat(convex): task, day and plan functions guarded by requireUser"
```

---

### Task 4: REST API over HTTP actions

**Model:** sonnet

**Files:**
- Create: `convex/rest.ts`, `convex/rest.test.ts`, `convex/restOps.ts`, `convex/http.ts`, `convex/http.test.ts`

**Interfaces:**
- Consumes: `convex/model.ts`.
- Produces: `createHandler({apiKey, ops})`, where `ApiOps` has `add`, `update`, `list` and `importArtifact`. `importArtifact` is wired in Task 7; until then it throws "not implemented".
- Produces routes: `POST/GET /api/tasks`, `PATCH /api/tasks/:source/:externalId`.

- [ ] **Step 1: Port the handler and its unit tests**

Recreate Plan 1's `supabase/functions/api/handler.ts` and `handler.test.ts` from git history (`git show 38c2b43:supabase/functions/api/handler.ts`, and the same for the test) as `convex/rest.ts` and `convex/rest.test.ts`, with these changes:
- Import `AddResult` from `../shared/validation.ts`, and `ConvexError` from `convex/values`.
- Add `importArtifact(body: unknown): Promise<unknown>` to `ApiOps`.
- Route `POST .../api/import` to `ops.importArtifact(await req.json())`. Keep the existing `/tasks` regex, which matches `/api/tasks...`.
- In `catch`, before the `InputError` branch, add:
  ```ts
  if (e instanceof ConvexError) {
    const d = e.data as { code?: string; message?: string };
    return json({ error: d.message ?? "error" }, d.code === "not_found" ? 404 : 422);
  }
  ```
- In the tests, the not-found case rejects with `new ConvexError({ code: "not_found", message: "task not found" })`. Add one case where `ConvexError({code:"input"})` gives 422, and one where `POST /api/import` calls `ops.importArtifact`. Keep every other existing case.

- [ ] **Step 2: Internal ops and routes**

`convex/restOps.ts`:
```ts
import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import * as m from "./model";

const uid = () => {
  const u = process.env.ALLOWED_USER_ID;
  if (!u) throw new Error("ALLOWED_USER_ID not set");
  return u;
};

export const add = internalMutation({
  args: { items: v.array(v.any()) },
  handler: (ctx, a) => m.addTasks(ctx.db, uid(), a.items, m.clock().t),
});
export const update = internalMutation({
  args: { source: v.string(), external_id: v.string(), patch: v.any() },
  handler: (ctx, a) =>
    m.updateTask(ctx.db, uid(), { source: a.source, external_id: a.external_id }, a.patch, m.clock().t).catch(m.asConvexError),
});
export const list = internalQuery({
  args: { source: v.union(v.string(), v.null()) },
  handler: (ctx, a) => m.listBySource(ctx.db, uid(), a.source),
});
```

`convex/http.ts`:
```ts
import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
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
      importArtifact: async () => { throw new Error("not implemented"); },
    },
  })(req),
);
for (const method of ["GET", "POST", "PATCH"] as const) http.route({ pathPrefix: "/api/", method, handler: rest });

export default http;
```

- [ ] **Step 3: Integration test**

`convex/http.test.ts`:
```ts
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
```

- [ ] **Step 4: Verify and commit**

Regenerate the types, then run `pnpm vitest run convex` and expect everything green. Run the typecheck. Then:
```bash
git add convex
git commit -m "feat(convex): REST ingest over HTTP actions with API key"
```

---

### Task 5: MCP endpoint

**Model:** sonnet

**Files:**
- Create: `convex/mcp.ts`, `convex/mcp.test.ts`
- Modify: `convex/http.ts`

**Interfaces:**
- Consumes: `api.agent.*` (Task 3).
- Produces:
  - `TOOL_DEFS`
  - `handleRpc(msg, call)`
  - `POST /mcp` (401 + `WWW-Authenticate` when unauthenticated), `GET /mcp` → 405
  - `GET /.well-known/oauth-protected-resource` and `/.well-known/oauth-protected-resource/mcp`

- [ ] **Step 1: Write the failing tests**

`convex/mcp.test.ts`:
```ts
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
```

- [ ] **Step 2: Implement `convex/mcp.ts`**

```ts
import { ConvexError } from "convex/values";

const date = { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" };
const hm = { type: "string", pattern: "^\\d{1,2}:\\d{2}$" };
const obj = (properties: Record<string, unknown>, required: string[] = []) =>
  ({ type: "object", properties, required, additionalProperties: false });

export const TOOL_DEFS = [
  { name: "get_snapshot", annotations: { readOnlyHint: true },
    description: "Start here. Tasks (carried/due/upcoming/done), the day's events+headline and next day's, the day's plan, top suggestions, app_url. date defaults to today (Australia/Brisbane); query filters by text or #tag.",
    inputSchema: obj({ date, query: { type: "string", maxLength: 100 } }) },
  { name: "add_tasks",
    description: "Add tasks in one batch (max 100). Each: {title, source?, external_id?, due?, time? HH:MM, priority? high|med|low, estimate_mins? (number or '1h 30m'), tags?, link?, note?, description?}. Existing source+external_id are skipped, never changed.",
    inputSchema: obj({ tasks: { type: "array", minItems: 1, maxItems: 100, items: { type: "object" } } }, ["tasks"]) },
  { name: "update_task",
    description: "Patch one task by id: done (sets done_on), due, time, priority, estimate_mins, tags, title, note, description, link.",
    inputSchema: obj({ id: { type: "string" }, patch: { type: "object" } }, ["id", "patch"]) },
  { name: "set_day",
    description: "Upsert a day's headline and/or events [{start HH:MM, end HH:MM, title, where?, allDay?}]. Events replace the day's list.",
    inputSchema: obj({ date, headline: { type: "string", maxLength: 500 }, events: { type: "array", maxItems: 100, items: { type: "object" } } }, ["date"]) },
  { name: "suggest", annotations: { readOnlyHint: true },
    description: "What to do next: ranked open tasks with reasons, plus next_free (today only).",
    inputSchema: obj({ date, limit: { type: "integer", minimum: 1, maximum: 20 } }) },
  { name: "plan",
    description: "Auto-plan time blocks between from and until (HH:MM) around events, using suggestions or task_ids. Proposes only; saves when commit is true.",
    inputSchema: obj({ date, task_ids: { type: "array", maxItems: 50, items: { type: "string" } }, from: hm, until: hm, commit: { type: "boolean" } }) },
  { name: "unplan", annotations: { destructiveHint: true },
    description: "Remove plan blocks for a date (all, or just task_ids).",
    inputSchema: obj({ date, task_ids: { type: "array", maxItems: 50, items: { type: "string" } } }, ["date"]) },
];

const VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"];
type Msg = { jsonrpc?: string; id?: string | number | null; method?: unknown; params?: any };

// Stateless MCP over JSON-RPC: initialize, ping, tools/list, tools/call. Notifications get no response.
export async function handleRpc(msg: Msg, call: (name: string, args: unknown) => Promise<unknown>) {
  const id = msg?.id ?? null;
  const ok = (result: unknown) => ({ jsonrpc: "2.0", id, result });
  const fail = (code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });
  if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") return fail(-32600, "invalid request");
  if (msg.id === undefined) return null;
  switch (msg.method) {
    case "initialize": {
      const asked = msg.params?.protocolVersion;
      return ok({
        protocolVersion: VERSIONS.includes(asked) ? asked : VERSIONS[1],
        capabilities: { tools: {} },
        serverInfo: { name: "toodoo", version: "0.2.0" },
      });
    }
    case "ping": return ok({});
    case "tools/list": return ok({ tools: TOOL_DEFS });
    case "tools/call": {
      const name = msg.params?.name;
      if (!TOOL_DEFS.some((t) => t.name === name)) return fail(-32602, `unknown tool: ${name}`);
      try {
        return ok({ content: [{ type: "text", text: JSON.stringify(await call(name, msg.params?.arguments ?? {})) }] });
      } catch (e) {
        const message = e instanceof ConvexError
          ? (e.data as { message?: string })?.message ?? String(e.data)
          : e instanceof Error ? e.message : String(e);
        return ok({ content: [{ type: "text", text: JSON.stringify({ error: message }) }], isError: true });
      }
    }
    default: return fail(-32601, `method not found: ${msg.method}`);
  }
}
```

- [ ] **Step 3: Routes**

Add to `convex/http.ts`, before `export default`:
```ts
import { api } from "./_generated/api";
import { handleRpc } from "./mcp";
import type { ActionCtx } from "./_generated/server";

const pick = (a: any, keys: string[]) =>
  Object.fromEntries(keys.filter((k) => a?.[k] !== undefined).map((k) => [k, a[k]]));

function callTool(ctx: ActionCtx, name: string, a: any): Promise<unknown> {
  switch (name) {
    case "get_snapshot": return ctx.runQuery(api.agent.getSnapshot, pick(a, ["date", "query"]));
    case "add_tasks": return ctx.runMutation(api.agent.addTasks, { tasks: Array.isArray(a?.tasks) ? a.tasks : [] });
    case "update_task": return ctx.runMutation(api.agent.updateTask, { id: String(a?.id ?? ""), patch: a?.patch ?? {} });
    case "set_day": return ctx.runMutation(api.agent.setDay, { day: a ?? {} });
    case "suggest": return ctx.runQuery(api.agent.suggest, pick(a, ["date", "limit"]));
    case "plan": return ctx.runMutation(api.agent.plan, pick(a, ["date", "task_ids", "from", "until", "commit"]));
    case "unplan": return ctx.runMutation(api.agent.unplan, pick(a, ["date", "task_ids"]));
    default: throw new Error(`unknown tool: ${name}`);
  }
}

const metadataUrl = () => `${process.env.CONVEX_SITE_URL}/.well-known/oauth-protected-resource`;
const metadata = httpAction(async () => Response.json({
  resource: `${process.env.CONVEX_SITE_URL}/mcp`,
  authorization_servers: [process.env.WORKOS_AUTHKIT_DOMAIN],
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
```
A signed-in user who isn't `ALLOWED_USER_ID` passes the 401 check, but every tool fails through `requireUser` with "not allowed". That's acceptable for a single user.

- [ ] **Step 4: Verify and commit**

Regenerate the types. Run `pnpm vitest run convex` and expect everything green, then run the typecheck. If `withIdentity(...).fetch` doesn't pass an identity into HTTP actions in convex-test, report it exactly. Don't weaken the auth check to make the test pass.
```bash
git add convex
git commit -m "feat(convex): stateless MCP endpoint with OAuth protected-resource metadata"
```

---

### Task 6: Web app on Convex + AuthKit

**Model:** sonnet

**Files:**
- Create: `apps/web/src/ConvexProviderWithAuthKit.tsx`, `.env.example` (repo root)
- Modify: `apps/web/src/main.tsx`, `apps/web/src/App.tsx`, `apps/web/src/App.test.tsx`, `apps/web/vite.config.ts`, `apps/web/tsconfig.json`, `apps/web/package.json`
- Delete: `apps/web/src/auth/`, `apps/web/src/lib/`, `apps/web/.env.local.example`, `apps/web/.env.cloud.example`

**Interfaces:**
- Consumes: `api.agent.getSnapshot`, `api.me.me`.
- Produces: an authenticated shell with a sign-in button and a Home placeholder. Plan 2 replaces Home.

- [ ] **Step 1: Packages and config**

```bash
pnpm --filter @toodoo/web add convex @workos-inc/authkit-react
pnpm --filter @toodoo/web remove @supabase/supabase-js
```
In `apps/web/vite.config.ts`:
- add `envDir: "../.."` and `envPrefix: ["VITE_", "CONVEX_URL"]`, so the root `.env.local` that Convex writes is read and `import.meta.env.CONVEX_URL` is exposed;
- add an alias `@convex` → `../../convex`.

Add the matching `@convex/*` path to `apps/web/tsconfig.json`.

Root `.env.example`:
```
# Written by `convex dev` into .env.local: CONVEX_DEPLOYMENT, CONVEX_URL
# Add yours to .env.local:
VITE_WORKOS_CLIENT_ID=client_...
VITE_WORKOS_REDIRECT_URI=http://localhost:5173
```

- [ ] **Step 2: Providers**

`apps/web/src/ConvexProviderWithAuthKit.tsx`: copy verbatim from Convex's template:
```tsx
import { type ReactNode, useCallback, useMemo } from "react";
import { ConvexProviderWithAuth, type ConvexReactClient } from "convex/react";

type UseAuth = () => { isLoading: boolean; user: unknown; getAccessToken: () => Promise<string | null> };

// From get-convex/templates template-react-vite-authkit: adapts AuthKit's useAuth to Convex.
export function ConvexProviderWithAuthKit({ children, client, useAuth }: {
  children: ReactNode; client: ConvexReactClient; useAuth: UseAuth;
}) {
  const useAuthFromWorkOS = useMemo(() => function useAuthFromWorkOS() {
    const { isLoading, user, getAccessToken } = useAuth();
    const fetchAccessToken = useCallback(async () => {
      try { return await getAccessToken(); } catch (error) { console.error("Error fetching WorkOS access token:", error); return null; }
    }, [getAccessToken]);
    return useMemo(() => ({ isLoading, isAuthenticated: !!user, fetchAccessToken }), [isLoading, user, fetchAccessToken]);
  }, [useAuth]);
  return <ConvexProviderWithAuth client={client} useAuth={useAuthFromWorkOS}>{children}</ConvexProviderWithAuth>;
}
```

`apps/web/src/main.tsx`:
```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AuthKitProvider, useAuth } from "@workos-inc/authkit-react";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithAuthKit } from "./ConvexProviderWithAuthKit";
import "./index.css";
import { App } from "./App";

const convex = new ConvexReactClient(import.meta.env.CONVEX_URL);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthKitProvider clientId={import.meta.env.VITE_WORKOS_CLIENT_ID} redirectUri={import.meta.env.VITE_WORKOS_REDIRECT_URI}>
      <ConvexProviderWithAuthKit client={convex} useAuth={useAuth}>
        <App />
      </ConvexProviderWithAuthKit>
    </AuthKitProvider>
  </StrictMode>,
);
```

- [ ] **Step 3: Write the failing test, then implement App**

`apps/web/src/App.test.tsx`:
```tsx
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ signIn: vi.fn(), signOut: vi.fn() }));
const state = vi.hoisted(() => ({ authed: false }));
vi.mock("@workos-inc/authkit-react", () => ({ useAuth: () => auth }));
vi.mock("convex/react", () => ({
  Authenticated: ({ children }: any) => (state.authed ? children : null),
  Unauthenticated: ({ children }: any) => (state.authed ? null : children),
  AuthLoading: () => null,
  useQuery: () => ({ tasks: { carried: [{}], due: [{}, {}], upcoming: [] } }),
}));

import { App } from "./App";
afterEach(cleanup);

it("offers sign-in when signed out", async () => {
  state.authed = false;
  render(<App />);
  await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
  expect(auth.signIn).toHaveBeenCalled();
});

it("shows the open count when signed in", () => {
  state.authed = true;
  render(<App />);
  expect(screen.getByText("3 open")).toBeInTheDocument();
});
```

`apps/web/src/App.tsx`:
```tsx
import { useAuth } from "@workos-inc/authkit-react";
import { Authenticated, AuthLoading, Unauthenticated, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";

// Placeholder home until Plan 2 builds the real UI.
function Home() {
  const s = useQuery(api.agent.getSnapshot, {});
  const { signOut } = useAuth();
  const open = s ? s.tasks.carried.length + s.tasks.due.length + s.tasks.upcoming.length : null;
  return (
    <main className="p-6">
      <h1 className="text-2xl font-semibold">toodoo</h1>
      {open != null && <p>{open} open</p>}
      <button className="mt-4 underline" onClick={() => signOut()}>Sign out</button>
    </main>
  );
}

function SignIn() {
  const { signIn } = useAuth();
  return (
    <main className="mx-auto mt-24 max-w-sm p-6">
      <h1 className="mb-6 text-2xl font-semibold">toodoo</h1>
      <button onClick={() => signIn()} className="rounded bg-black px-3 py-2 text-white">Sign in</button>
    </main>
  );
}

export function App() {
  return (
    <>
      <AuthLoading>{null}</AuthLoading>
      <Unauthenticated><SignIn /></Unauthenticated>
      <Authenticated><Home /></Authenticated>
    </>
  );
}
```
Delete `src/auth/`, `src/lib/` and the two old env examples.

- [ ] **Step 4: Verify and commit**

Run `pnpm --filter @toodoo/web test` and expect 2 passing tests. Run `pnpm --filter @toodoo/web typecheck` and expect it clean; it type-checks `convex/_generated` through the alias. Run `pnpm --filter @toodoo/web build` and expect success.
```bash
git add -A apps/web .env.example package.json pnpm-lock.yaml
git commit -m "feat(web): Convex + WorkOS AuthKit shell replaces Supabase auth"
```

---

### Task 7: Artifact import into Convex

**Model:** sonnet

**Files:**
- Modify: `scripts/artifact-map.ts`, `scripts/artifact-map.test.ts`, `convex/http.ts` (wire `importArtifact`)
- Create: `convex/importArtifact.ts`, `convex/importArtifact.test.ts`, `scripts/import-artifact.ts`

**Interfaces:**
- Consumes: `mapTasks`, `mapDays`, `derivedKey` (kept).
- Changes: `mapBlocks(plans, keyOf: Map<string, {source: string; external_id: string}>)` now returns `{date, source, external_id, start, mins}[]`.
- Produces: `internal.importArtifact.run({tasks, days, blocks})`, returning `{tasks, days, blocks, dropped}`; `POST /api/import`; and the CLI `node --env-file=.env.import --import tsx scripts/import-artifact.ts scripts/artifact-export`.

- [ ] **Step 1: Change `mapBlocks` and its test**

In `scripts/artifact-map.ts`, change `mapBlocks` to take `keyOf: Map<string, {source: string; external_id: string}>`. Each mapped block gets `source` and `external_id` from `keyOf.get(String(b.taskId))` instead of `task_id`. It still drops missing tasks, bad times and duplicates (keyed by `date|source|external_id`) and clamps `mins` to 15–1440.

Update the blocks test to build `keyOf` as `new Map([["a", { source: "jira", external_id: "jira:A-1" }]])` and expect `[{ date: "2026-10-01", source: "jira", external_id: "jira:A-1", start: "09:00", mins: 15 }]`.

- [ ] **Step 2: Write the failing import mutation test**

`convex/importArtifact.test.ts`:
```ts
// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { beforeEach, expect, it, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
beforeEach(() => { vi.stubEnv("ALLOWED_USER_ID", "user_steve"); });
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

it("imports idempotently and drops orphan blocks", async () => {
  const t = convexTest(schema, modules);
  expect(await t.mutation(internal.importArtifact.run, body)).toEqual({ tasks: 2, days: 1, blocks: 1, dropped: 1 });
  expect(await t.mutation(internal.importArtifact.run, body)).toEqual({ tasks: 2, days: 1, blocks: 1, dropped: 1 });
  const counts = await t.run(async (ctx) => [
    (await ctx.db.query("tasks").collect()).length,
    (await ctx.db.query("days").collect()).length,
    (await ctx.db.query("plan_blocks").collect()).length,
  ]);
  expect(counts).toEqual([2, 1, 1]);
});
```

- [ ] **Step 3: Implement the mutation**

`convex/importArtifact.ts`:
```ts
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

// One-off cutover from the claude.ai artifact. Upserts by source+external_id, so re-runs overwrite imported fields.
export const run = internalMutation({
  args: { tasks: v.array(v.any()), days: v.array(v.any()), blocks: v.array(v.any()) },
  handler: async (ctx, a) => {
    const user_id = process.env.ALLOWED_USER_ID;
    if (!user_id) throw new Error("ALLOWED_USER_ID not set");
    const find = (source: string, external_id: string) => ctx.db.query("tasks")
      .withIndex("by_user_source_ext", (q) => q.eq("user_id", user_id).eq("source", source).eq("external_id", external_id)).first();
    for (const t of a.tasks) {
      const doc = { ...t, user_id, updated_at: Date.now() };
      const hit = await find(t.source, t.external_id);
      if (hit) await ctx.db.replace(hit._id, doc); else await ctx.db.insert("tasks", doc);
    }
    for (const d of a.days) {
      const hit = await ctx.db.query("days").withIndex("by_user_date", (q) => q.eq("user_id", user_id).eq("date", d.date)).first();
      const doc = { user_id, date: d.date, headline: d.headline ?? null, events: d.events ?? [] };
      if (hit) await ctx.db.replace(hit._id, doc); else await ctx.db.insert("days", doc);
    }
    let blocks = 0, dropped = 0;
    for (const b of a.blocks) {
      const task = await find(b.source, b.external_id);
      if (!task) { dropped++; continue; }
      const hit = (await ctx.db.query("plan_blocks").withIndex("by_task", (q) => q.eq("task_id", task._id)).collect())
        .find((x) => x.date === b.date);
      const doc = { user_id, date: b.date, task_id: task._id, start: b.start, mins: b.mins };
      if (hit) await ctx.db.replace(hit._id, doc); else await ctx.db.insert("plan_blocks", doc);
      blocks++;
    }
    return { tasks: a.tasks.length, days: a.days.length, blocks, dropped };
  },
});
```
In `convex/http.ts`, replace the `importArtifact` stub with `(body) => ctx.runMutation(internal.importArtifact.run, body as any)`. Add one REST test case to `convex/http.test.ts`: `POST /api/import` with the test body gives `{tasks:2, days:1, blocks:1, dropped:1}`.

- [ ] **Step 4: Runner**

`scripts/import-artifact.ts`:
```ts
// One-off import of the claude.ai planner artifact export into Convex via POST /api/import. Idempotent.
// Usage: node --env-file=.env.import --import tsx scripts/import-artifact.ts scripts/artifact-export
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { mapBlocks, mapDays, mapTasks } from "./artifact-map.ts";

const dir = process.argv[2];
const { CONVEX_SITE_URL, TOODOO_API_KEY } = process.env;
if (!dir || !CONVEX_SITE_URL || !TOODOO_API_KEY) {
  console.error("usage: needs <exportDir> and CONVEX_SITE_URL, TOODOO_API_KEY");
  process.exit(1);
}

async function load<T>(collection: string) {
  const path = join(dir, collection);
  const files = (await readdir(path).catch(() => [] as string[])).filter((f) => f.endsWith(".json"));
  return Promise.all(files.map(async (f) => {
    const raw = JSON.parse(await readFile(join(path, f), "utf8"));
    return { id: f.slice(0, -5), data: (raw.data ?? raw) as T };
  }));
}

const tasks = mapTasks(await load("tasks"));
const keyOf = new Map(tasks.map((t) => [t.artifactId, { source: t.row.source, external_id: t.row.external_id }]));
const body = {
  tasks: tasks.map((t) => t.row),
  days: mapDays(await load("days")),
  blocks: mapBlocks(await load("plans"), keyOf),
};
const res = await fetch(`${CONVEX_SITE_URL}/api/import`, {
  method: "POST",
  headers: { authorization: `Bearer ${TOODOO_API_KEY}`, "content-type": "application/json" },
  body: JSON.stringify(body),
});
const out = await res.json();
if (!res.ok) { console.error(res.status, out); process.exit(1); }
console.log(`imported ${out.tasks} tasks, ${out.days} days, ${out.blocks} plan blocks (${out.dropped} dropped)`);
```

- [ ] **Step 5: Run against the local deployment**

Push the functions to the local backend with `CONVEX_AGENT_MODE=anonymous pnpm convex dev --once`. Create `.env.import` (gitignored) with `CONVEX_SITE_URL=<local site URL from Task 2's report or .env.local>` and `TOODOO_API_KEY=local-dev-key`.

Run the import twice. Expect `imported 54 tasks, 13 days, 16 plan blocks (0 dropped)` both times. Then check the counts with `pnpm convex data tasks --limit 100` (or the equivalent CLI command) and report them.

- [ ] **Step 6: Verify and commit**

Run `pnpm vitest run` and the typecheck.
```bash
git add scripts convex
git commit -m "feat(import): artifact import into Convex via /api/import"
```

---

### Task 8: CI, Vercel and setup checklist

**Model:** haiku

**Files:**
- Modify: `.github/workflows/ci.yml`, `vercel.json`, `docs/setup.md`, `docs/superpowers/plans/2026-10-12-plan1-deferred.md`

- [ ] **Step 1: CI**

`.github/workflows/ci.yml`:
```yaml
name: ci
on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm test
```
`convex/_generated` is committed, so CI needs no Convex deployment.

- [ ] **Step 2: Vercel**

`vercel.json`:
```json
{
  "installCommand": "pnpm install --frozen-lockfile",
  "buildCommand": "npx convex deploy --cmd 'pnpm --filter @toodoo/web build' --cmd-url-env-var-name CONVEX_URL",
  "outputDirectory": "apps/web/dist",
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

- [ ] **Step 3: Setup checklist**

Replace `docs/setup.md`:
````markdown
# toodoo setup

## Local (no accounts needed)
1. `pnpm install`.
2. `pnpm dev` starts a local Convex backend plus Vite. The first run creates an anonymous local deployment and writes `.env.local`.
3. Set local env vars once:
   `pnpm convex env set WORKOS_CLIENT_ID <dev client id>`,
   `WORKOS_AUTHKIT_DOMAIN https://<your>.authkit.app`,
   `ALLOWED_USER_ID <your WorkOS user id>`,
   `TOODOO_API_KEY <random>`,
   `APP_URL http://localhost:5173`.
4. Add `VITE_WORKOS_CLIENT_ID` and `VITE_WORKOS_REDIRECT_URI=http://localhost:5173` to `.env.local` (see `.env.example`).

## WorkOS (AuthKit)
1. Create an organisation and project, then open **AuthKit**. Note:
   - the **Client ID** (staging and production differ);
   - the **AuthKit domain** (`https://<name>.authkit.app`).
2. **Redirects:** add `http://localhost:5173` and your Vercel URL as redirect URIs and allowed origins.
3. **Sign-in:** enable your sign-in method, e.g. email + Google. After you've signed in once, turn off open sign-up or restrict it to your email.
4. **Your user ID:** copy it from **Users** (`user_...`). It is `ALLOWED_USER_ID`.
5. **MCP connector:** under **Connect → Configuration**, enable **Client ID Metadata Document** and **Dynamic Client Registration**.
6. **Resource Indicator:** add `https://<deployment>.convex.site/mcp` for each Convex deployment Claude connects to.

## Convex
1. `pnpm convex login`, then `pnpm dev:cloud`. This creates or links the project and your cloud dev deployment.
2. Set the same env vars on the cloud dev deployment, and on prod with `pnpm convex env set --prod ...`. Prod uses the production WorkOS client ID and `APP_URL=<vercel url>`.
3. Create a **production deploy key** (Dashboard → Settings → Deploy keys).

## Vercel
1. Import the GitHub repo with the repo root as the root directory. Vercel picks up `vercel.json`.
2. Before the first build, set these env vars:
   - `CONVEX_DEPLOY_KEY` (prod deploy key)
   - `VITE_WORKOS_CLIENT_ID` (production client ID)
   - `VITE_WORKOS_REDIRECT_URI=<vercel url>`
3. Each push to `main` deploys the Convex functions and schema, then builds the web app.

## Import your artifact data
Create `.env.import` with `CONVEX_SITE_URL=https://<prod>.convex.site` and `TOODOO_API_KEY=<prod key>`, then run:
`node --env-file=.env.import --import tsx scripts/import-artifact.ts scripts/artifact-export`

## Claude connector
claude.ai → Settings → Connectors → Add custom connector → `https://<prod>.convex.site/mcp` → sign in with AuthKit → Allow.
````

In `docs/superpowers/plans/2026-10-12-plan1-deferred.md`, add a line at the top: `Supabase-specific items (RLS, pgTAP, edge functions, consent page) are obsolete after the Convex pivot (Plan 1b).`

- [ ] **Step 4: Verify and commit**

`pnpm install --frozen-lockfile && pnpm typecheck && pnpm test && pnpm build`, all green.
```bash
git add .github vercel.json docs/setup.md docs/superpowers/plans/2026-10-12-plan1-deferred.md
git commit -m "ci: Convex CI, Vercel convex deploy and setup checklist"
```
