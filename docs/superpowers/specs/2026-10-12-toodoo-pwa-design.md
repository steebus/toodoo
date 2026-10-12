# toodoo PWA — design (spec 1 of 2)

Date: 2026-10-12 · Revised 2026-10-12: backend moved from Supabase to Convex + WorkOS AuthKit · Status: approved

## Goal

Replace the claude.ai planner artifact ((Steve's private claude.ai planner artifact)) with a proper PWA on Steve's standard stack, keeping all current functionality, completely overhauling the UI, and keeping the morning agent working as close to today as possible. Add "what should I do next" and "plan my afternoon" prompts via Claude.

Spec 2 (later): Epics (prioritised, hideable, filterable; tasks derive priority) and Kanban.

## Users & constraints

- Single user (Steve). Desktop-first; mobile must be first-class for checking, ticking, quick add and viewing the plan.
- Timezone fixed to `Australia/Brisbane` (no DST). `// ponytail: hard-coded TZ, move to a user setting if multi-user`.
- UI rule: little to no explainer text.
- Steve provisions Convex, WorkOS, Vercel and GitHub; the repo must work with `pnpm dev` (local Convex backend) and `pnpm dev:cloud` (Convex cloud dev deployment).
- Backend is **Convex** (Steve wants to learn the platform). Auth is **WorkOS AuthKit** for both the web app and Claude's MCP connector.

## Current functionality to preserve

- **Tasks:** title, description, note, link, source, due date, time, priority (high/med/low/none), estimate, multiple tags, done/doneOn, manual order. Unticked tasks roll over ("carried over" with days waiting). Done tasks stay as history.
- **List:** groups Carried over / Today / Done today / Coming up; group by status, due, priority, tag or source; sort by manual, due, priority, time or tag; tag filter (incl. untagged); inline add with details; edit; delete; drag reorder; fresh-add highlight; progress (done of total today).
- **Day plan:** timeline 06:00–22:00 (expands to fit), calendar events (timed and all-day) from `days`, headline; task blocks you can drag to move, resize, tick or remove; overlapping items laid out in lanes; now-line; click an empty slot to open a task picker (search, create new); drag a task from the list onto the timeline; day navigation and date picker; a "done that day" list; keyboard move/resize of blocks.
- **Suggestions:** scored "Suggested for <day>" (carried from last plan, overdue, due that day, priority, estimate already planned, planned elsewhere, fixed time) with reasons; "Plan all".
- **Effort:** planned vs actual minutes against estimate; block length defaults to the remaining estimate, else 60m for high priority and 30m otherwise; 15m snap.
- **Agent:** the weekday 6:30 routine gathers Calendar/Gmail/Jira, writes tasks and days, notifies, and adds tasks from Steve's reply.

## Architecture

```
toodoo/                       pnpm workspace
├─ apps/web/                  Vite + React + TS + Tailwind + shadcn + convex/react + @workos-inc/authkit-react + vite-plugin-pwa
├─ convex/                    schema.ts, auth.config.ts, tasks.ts / days.ts / plans.ts (queries, mutations),
│                             http.ts (MCP, REST, /.well-known), importArtifact.ts
├─ shared/                    pure TS shared by web, convex and scripts:
│                             planning.ts, validation.ts (zod), snapshot.ts (buildSnapshot)
├─ plugin/                    Claude plugin marketplace containing the `toodoo` skill
├─ scripts/                   artifact-map.ts + import runner
└─ .github/workflows/         CI (typecheck, test)
```

- **Hosting:** Vercel builds `apps/web` from GitHub with build command `npx convex deploy --cmd "pnpm build"` (deploys Convex functions and schema, then builds the web app against the production Convex URL). GitHub Actions runs typecheck and tests on PRs and `main`.
- **Env:** `pnpm dev` runs the local Convex backend (`convex dev --local`) plus Vite; `pnpm dev:cloud` runs `convex dev` against Steve's cloud dev deployment plus Vite. `CONVEX_DEPLOY_KEY` lives in Vercel. Convex env vars: `WORKOS_CLIENT_ID`, `WORKOS_AUTHKIT_DOMAIN`, `ALLOWED_USER_ID`, `TOODOO_API_KEY`, `APP_URL`.
- **Auth:** AuthKit hosted login for the web app (`@workos-inc/authkit-react` with Convex's AuthKit integration). `convex/auth.config.ts` trusts two issuers that share the same WorkOS user id (`subject`):
  - the web issuer, `https://api.workos.com/user_management/<clientId>`;
  - the AuthKit domain for MCP access tokens, `https://<authkit_domain>`, with audience `${CONVEX_SITE_URL}/mcp`.

  Every public function calls `requireUser(ctx)`, which reads `ctx.auth.getUserIdentity()` and rejects anyone but `ALLOWED_USER_ID`. `// ponytail: single allowed user; replace with membership checks if multi-user`.
- **Realtime:** Convex queries are reactive, so agent writes appear live with no extra wiring.
- **PWA:** installable, app shell precached, last-fetched data cached for offline reading. Writes require a connection. `// ponytail: no offline write queue, add if missed in practice`.

## Data model

Convex tables. Every document has `userId: string`, the WorkOS subject.

**tasks**

| field | notes |
|---|---|
| `title` | ≤300 |
| `description?` | ≤2000 |
| `note?` | ≤500 |
| `link?` | http(s) only |
| `source` | default `you`; free text, so new connectors need no schema change |
| `externalId?` | |
| `due` | `YYYY-MM-DD` |
| `time?` | `HH:MM` |
| `priority?` | `high`, `med` or `low` |
| `estimateMins?` | 1–1440 |
| `tags` | string array |
| `done`, `doneOn?` | |
| `sortOrder` | number |
| `updatedAt` | |

Indexes: `by_user_done_due [userId, done, due]`, `by_user_source_ext [userId, source, externalId]`, `by_user_doneOn [userId, doneOn]`.

**days**: `userId`, `date`, `headline?`, `events: {start?, end?, title, where?, allDay?}[]`. Index `by_user_date`.

**planBlocks**: `userId`, `date`, `taskId: Id<"tasks">`, `start` (`HH:MM`), `mins` (15–1440). Indexes `by_user_date`, `by_task`. One block per task per day, enforced in the mutation.

Convex has no foreign-key or unique constraints, so integrity lives in mutations:
- add-if-absent on `by_user_source_ext` inside one transactional mutation;
- deleting a task deletes its blocks in the same mutation.

Spec 2 will add `epics` and `tasks.epicId`, plus a Kanban `status`.

## Shared logic (`shared/`)

Pure TypeScript, with no Convex or DOM imports, used by the web app, Convex functions and scripts:

- **`planning.ts`**, moved unchanged from Plan 1 with its tests:
  - Brisbane dates and durations;
  - `effortMap`, `defaultBlockMins`;
  - `suggestions`, with the artifact's weights ported 1:1;
  - `busySpans`, `firstFree`;
  - `autoPlan`, which places fixed-time tasks first, then the rest in suggestion order into free gaps;
  - `layoutLanes`.
- **`validation.ts`**, moved from Plan 1's `tasks.ts` minus the Supabase writes: the zod schemas and normalisers `TaskInput`, `TaskPatch`, `DayInput`, `normLink`, `normPriority`, `parseTags`, `InputError`.
- **`snapshot.ts`**: `buildSnapshot`, which is pure. Loading moves into a Convex query.

## MCP server (`convex/http.ts` → `/mcp`)

Seven coarse, batched tools, with compact JSON responses:

| tool | behaviour |
|---|---|
| `get_snapshot({date?, query?})` | Open tasks (carried, due that day, coming up), done that day, `days` for that date and the next, that day's plan blocks, top 5 suggestions, `app_url`. `query` filters by text, or exactly by tag when it starts with `#`. |
| `add_tasks({tasks[]})` | Idempotent insert keyed on `source + externalId`. Existing matches are skipped, never overwritten. Returns `{created[], skipped[], errors[]}`. |
| `update_task({id, patch})` | Tick or untick (sets `doneOn`), reschedule, reprioritise, retag, edit text. |
| `set_day({date, headline?, events?})` | Upsert a day. |
| `suggest({date?, limit?})` | Ranked suggestions with reasons, plus `next_free`. |
| `plan({date, task_ids?, from?, until?, commit?})` | Runs `autoPlan`. Proposal only unless `commit: true`. |
| `unplan({date, task_ids?})` | Remove blocks: all for that date if `task_ids` is omitted; an empty array is a no-op. |

- **Discovery and 401:** the HTTP action serves `/.well-known/oauth-protected-resource`, with `resource` = `${CONVEX_SITE_URL}/mcp` and `authorization_servers` = the AuthKit domain. Unauthenticated `/mcp` calls get `401` with `WWW-Authenticate: Bearer resource_metadata="…"`.
- **AuthKit setup:** CIMD and DCR are enabled, and `${CONVEX_SITE_URL}/mcp` is registered as a Resource Indicator.
- **Identity:** tools run `ctx.runQuery` / `ctx.runMutation` on Convex functions. Those inherit the caller's identity and go through `requireUser`.
- **Transport:** the MCP TypeScript SDK's fetch-based handler, if it runs in the Convex runtime; the first task is a spike to confirm this. Otherwise, a small hand-written stateless JSON-RPC handler for `initialize`, `tools/list` and `tools/call`.

## REST API (`convex/http.ts` → `/api/tasks`)

For Trippn and other apps. Requests send `Authorization: Bearer <TOODOO_API_KEY>` and act as `ALLOWED_USER_ID` via internal mutations. `// ponytail: single env key, move to a hashed keys table if more users/keys`.

- `POST /api/tasks`: one task or `{tasks:[…]}`, max 100, with the same idempotency as `add_tasks`. Returns 422 when nothing was created or skipped and there are errors.
- `PATCH /api/tasks/:source/:externalId`: update, e.g. Trippn marks its task done.
- `GET /api/tasks?source=…`: list by source.

Error codes:
- 400: bad JSON or bad path
- 401: bad key
- 404: not found
- 422: input errors
- 500: anything else, with a generic message and the detail logged

## `toodoo` skill (plugin)

Unchanged from Plan 1, since the tool names and flows are the same. It covers:
- conventions such as `jira:<KEY>` and `gmail:<threadId>` (hex);
- the morning run;
- "what next";
- "plan my X": preview, then commit with the previewed `task_ids`.

The routine prompt becomes "Use the toodoo skill to run the morning plan", with the plugin enabled and the toodoo connector added.

## Migration (artifact import)

`scripts/artifact-map.ts` is kept from Plan 1 and maps the exported JSON:
- Jira keys come from links.
- Gmail `thread-f` decimals become hex thread IDs.
- When several docs share a key, the newest gets it and the others get `artifact:<docId>`.

A runner passes the mapped tasks, days and blocks to an internal `importArtifact` mutation via `npx convex run`. The mutation:
- upserts by `source + externalId`;
- links blocks to the new task IDs;
- drops blocks whose task is missing.

The import is idempotent. Re-running it overwrites imported fields, which is fine for a one-off cutover.

The artifact stays live and untouched until the routine is switched over.

## UI

Visual direction comes from the **impeccable** workflow during build: direction brief → comp approved by Steve → build → finish review. Guiding brief: *calm, focused, personal day planner with character, and rich, delightful motion* (see Motion & flourishes). Priorities in order: reduce density, give it character, smooth interactions, mobile, layout.

**Layout (desktop):** two panels, Plan and To do, with an **adjustable divider** (drag, arrow keys, double-click to reset) plus three **snap presets** matching the workflow:

- **Capture** (`1`): the list gets about 70%.
- **Plan** (`2`): an even split.
- **Focus** (`3`): the plan gets about 70% and the list becomes a compact narrow column.

The position is stored per device in localStorage. The header carries the date, the headline as a hero line, and the progress.

**Density:**

- A single **smart quick-add input** parses `tomorrow 3pm !high #work ~1h` into chips (date, time, priority, tags, estimate) as you type, replacing the Details panel.
- Group, sort and tag filter live behind one **View** menu.
- Row actions appear on hover or focus. Editing opens a side sheet (desktop) or bottom sheet (mobile).
- A row shows at most 3 tags.
- No hint text; a `?` sheet lists the shortcuts.

**Suggestions:** a slim "Next up" strip at the top of the list for the viewed day, with "Plan all".

**Interactions:**

- **dnd-kit** for list reorder and list→timeline drag (pointer, touch and keyboard in one model).
- Timeline blocks move and resize by pointer or keyboard; click an empty slot to open the picker (popover on desktop, bottom sheet on mobile).
- Shortcuts: `n` add, `j`/`k` move, `x` tick, `e` edit, `p` plan into the first free slot, `[`/`]` previous/next day, `t` today, `1`/`2`/`3` presets, `?` help.
- Optimistic updates via react-query, with rollback and an error toast on failure; an Undo toast for tick, delete, plan and unplan.

**Mobile (<820px):** bottom tabs **Today** (list) and **Plan** (timeline); swipe right to tick, swipe left for Plan / Tomorrow actions; a thumb-reach add button opens the smart input in a sheet; safe-area aware.

Light and dark themes; WCAG AA contrast; every interaction keyboard-reachable.

## Motion & flourishes

Steve loves visual flourishes, animations and transitions, so motion is a first-class part of the design, not polish. The goal is calm but alive: motion explains what changed, rewards progress, and never blocks input.

- **Library:** `motion` (Framer Motion) for layout, presence and spring animations, and for the swipe gestures. The View Transitions API handles day navigation and preset changes. Everything else is CSS.
- **Moments to design deliberately** (impeccable's animate/delight passes):
  - **Tick done:** the checkbox draws, the row settles into Done today with a layout animation, and the progress bar springs forward. Finishing the last task of the day gets a small celebration (e.g. a confetti or bloom burst).
  - **Add:** the quick-add chips pop in as they are parsed; on Enter the new row flies from the input to its group.
  - **Plan:** a task dragged or planned onto the timeline morphs from row to block (a shared layout animation); blocks spring to the 15m snap; the now-line pulses gently.
  - **Divider presets:** panels glide between Capture, Plan and Focus with springs, and the list crossfades into its compact form.
  - **Day navigation:** the timeline slides in the direction of travel (View Transition).
  - **Sheets/popovers:** spring in from their origin; the backdrop blurs in.
  - **Morning arrival:** new tasks from the agent stagger in with a subtle highlight; the headline types or fades in as the hero line.
  - **Undo toast:** a countdown ring drains around the undo button.
- **Rules:** 60fps (animate transform and opacity only); interactive within 100ms; durations around 150–350ms with springs over linear easing; `prefers-reduced-motion` swaps movement for fades or instant changes; no motion on initial page load beyond the hero line.

## Error handling

- **Web:** Convex optimistic updates where it matters (tick, reorder, plan drag), with a toast on failure. Add-task failures restore the input. When auth expires, AuthKit sign-in opens and the draft is kept.
- **MCP and API:** input is validated with the shared zod schemas. Results are structured `{error}`, and batches report errors per item.
- **Import:** reports skipped documents with reasons, and exits non-zero on failure.

## Testing

- **Shared logic:** Vitest unit tests for `shared/`, moved from Plan 1: planning, validation, snapshot and the import mapping.
- **Convex functions:** `convex-test`, Convex's in-memory test harness, covering:
  - `requireUser` rejection;
  - add-if-absent idempotency;
  - cascade delete of blocks;
  - plan commit;
  - the import mutation;
  - the REST and MCP HTTP handlers: status codes, and 401 with resource metadata.
- **UI:** component tests for the critical flows: add, tick, plan via picker.
- **Manual:** browser checks at desktop and mobile widths before each UI milestone, and one real Claude connector sign-in against the cloud deployment.

## Delivery order

1. **Convex pivot (Plan 1b):**
   - remove Supabase and move the shared logic;
   - Convex schema and functions;
   - AuthKit auth;
   - MCP and REST HTTP actions;
   - import, CI, and `dev` / `dev:cloud`.
2. UI via impeccable (Plan 2): a minimal functional shell, then the overhaul.
3. PWA install and offline polish.
4. Switch the morning routine over, with Steve.

## Out of scope (this spec)

- Epics and Kanban.
- An in-app agent with its own OAuth connectors.
- Offline writes.
- A Google Tasks connector.
- Multi-user use and sharing.
- Push notifications from the app itself (the routine's Claude push stays).
