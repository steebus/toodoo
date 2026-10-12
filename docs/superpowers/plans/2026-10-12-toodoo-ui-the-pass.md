# toodoo UI — "The Pass" Implementation Plan (Plan 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Each task names a **Model**. Reviewers use `sonnet`, and the final review uses `opus`. The visual tasks also run inside impeccable's gated build state machine (`impeccable build-phase`). Its gates are binding: a task is not done while its gate is open.

**Goal:** Build the real toodoo app UI in the approved "The Pass" world, then finish the cloud cutover. The UI must keep every function the spec lists, match approved comp `apps/web/.impeccable/mocks/comp-1.png`, and include the spec's motion, mobile and PWA requirements. The cutover covers Convex, WorkOS, Vercel, the data import, the Claude connector and the routine switch.

**Architecture:**
- **Data:** one Convex query, `agent.board({date, now})`, feeds the whole screen. All writes go through the existing auth-guarded mutations, plus two new block mutations, with Convex optimistic updates.
- **Pure logic:** quick-add parsing, grouping/sorting and lane layout live in `shared/` and are unit-tested.
- **UI:** React components under `apps/web/src/` render the measured comp. Visual fidelity is gated by `impeccable comp-diff`, and behaviour by Vitest + Testing Library.

**Tech Stack:** Vite 8, React 19, TypeScript 7, Tailwind v4, Convex (`convex/react`), WorkOS AuthKit, `@dnd-kit/core` + `@dnd-kit/sortable`, `motion`, `vite-plugin-pwa`, Vitest 5.

**Spec:** `docs/superpowers/specs/2026-10-12-toodoo-pwa-design.md`. Design contract: `apps/web/.impeccable/surfaces/src-app-tsx.md` (direction contract, seed 953035aa). Product: `apps/web/PRODUCT.md`.

**Ruling on plan granularity:** the pure-logic and backend tasks (1, 2) carry complete code. The visual and interaction tasks carry exact behaviour, test cases and gates, but not pre-written JSX. Their markup and styling must come from the measured comp spec (task 3), which does not exist yet. Pre-writing it would mean guessing the very values the gates measure. Cost if wrong: implementers on tasks 5–12 need a stronger model (named per task).

## Global Constraints

- **Comp is law.** `comp-1.png` is the approved north star: steel rails, thermal dockets with perforated tops and condensed caps titles, tabular mono for every time/duration/count, docket red `#D7261E`, bump green `#1E8A4C`, one blue biro ring on the top pick, and the span header ("10:00 → 3:00").
  - Nothing the comp doesn't show is added to the first viewport.
  - Steve's readability steer is honoured inside that grammar: legible sizes and AA contrast. The docket type is never swapped for plain list rows.
- **No explainer copy.** The comp's footer legend ("Drag to reorder · Click to view…") is the one exception: it is the comp's own text and stays unless Steve says otherwise.
- **Theme:** light-first. Dark theme is a token swap (`:root[data-theme="dark"]` plus `prefers-color-scheme`), with WCAG AA in both.
- **Motion:** per the spec's Motion & flourishes section. Animate transform and opacity only; durations 150–350ms on springs. `prefers-reduced-motion` swaps movement for fades.
- **Shortcuts:**
  - `n` add
  - `j`/`k` move
  - `x` tick
  - `e` edit
  - `p` plan into first free slot
  - `[`/`]` previous/next day
  - `t` today
  - `1`/`2`/`3` presets
  - `?` help
- **Presets:** Capture ≈ list 70%, Plan = the comp's split, Focus ≈ plan 70%. The divider supports drag, arrow keys and double-click reset. Its position is stored in localStorage per device.
- **Mobile (<820px):** bottom tabs Today/Plan, swipe right to tick, swipe left for Plan/Tomorrow, a thumb-reach add button, and safe-area aware layout.
- **Data writes:**
  - Every write goes through `api.agent.*`, which is auth-guarded, with optimistic updates where the spec names them.
  - An Undo toast covers tick, delete, plan and unplan.
  - A failed write rolls back and shows an error toast.
- **Time:** every query takes a minute-rounded `now` (`useMinuteTick`). Never call `new Date()` inside Convex queries.
- **Field names** stay snake_case. Shared code keeps relative `.ts` imports.
- **Commits:** each agent uses its own harness `Co-Authored-By` trailer.

## Review Focus

1. **Drag at the edges of the day:** dragging a docket onto the timeline near midnight, or past 22:00, must clamp and snap to 15m. It must never create a block outside 00:00–24:00 or under 15m.
2. **Optimistic tick while offline:** the row animates to done and then rolls back with an error toast. No phantom "done" may survive a failed write.
3. **Quick-add ambiguity:** "lunch with Sam at 1" (no am/pm) means 1pm during working hours. "fri" on a Friday means next Friday. "#c++" makes a sane tag.
4. **Keyboard-only use:** every action in the spec must be reachable without a pointer, including timeline move/resize and the slot picker.
5. **Reduced motion:** no movement, only fades. The celebration is replaced by a static tick.

---

### Task 1: Board query and block mutations

**Model:** sonnet

**Files:**
- Modify: `convex/model.ts`, `convex/agent.ts`, `convex/agent.test.ts`

**Interfaces:**
- Produces:
  - `api.agent.board({date?: string, now?: number})` →
    ```
    {
      today, date, nowM,
      day: {date, headline, events} | null,
      tasks: BoardTask[],
      blocks: {task_id, date, start, mins}[],
      suggestions: {id, title, reasons}[],
      app_url
    }
    ```
    where `BoardTask` = every task field plus `id`. It returns open tasks, plus tasks done on or after `date - 1`, plus any task with a block on `date`.
  - `api.agent.placeBlock({task_id, date, start, mins})` upserts one block. `start` is snapped to 15m and clamped to 00:00–23:45; `mins` is clamped to 15–1440 and to the end of the day.
  - `api.agent.removeBlock({task_id, date})`.

- [ ] **Step 1: Failing tests**, appended to `convex/agent.test.ts`, reusing its `setup()` and fake clock at 12:00 Brisbane:

```ts
it("board returns full tasks, blocks and suggestions for the day", async () => {
  const t = setup();
  const { created } = await t.mutation(api.agent.addTasks, { tasks: [{ title: "Board me", priority: "high", description: "why" }] });
  await t.mutation(api.agent.placeBlock, { task_id: created[0].id, date: "2026-10-12", start: "13:07", mins: 50 });
  const b = await t.query(api.agent.board, {});
  expect(b.today).toBe("2026-10-12");
  expect(b.tasks.find((x) => x.id === created[0].id)).toMatchObject({ title: "Board me", description: "why", priority: "high" });
  expect(b.blocks).toEqual([{ task_id: created[0].id, date: "2026-10-12", start: "13:00", mins: 45 }]);
});

it("placeBlock clamps to the day and snaps", async () => {
  const t = setup();
  const { created } = await t.mutation(api.agent.addTasks, { tasks: [{ title: "Late" }] });
  await t.mutation(api.agent.placeBlock, { task_id: created[0].id, date: "2026-10-12", start: "23:55", mins: 120 });
  const b = await t.query(api.agent.board, {});
  expect(b.blocks[0]).toMatchObject({ start: "23:45", mins: 15 });
  await expect(t.mutation(api.agent.placeBlock, { task_id: "nope", date: "2026-10-12", start: "10:00", mins: 30 }))
    .rejects.toThrow(/task not found/);
});

it("removeBlock removes only that task's block on that date", async () => {
  const t = setup();
  const { created } = await t.mutation(api.agent.addTasks, { tasks: [{ title: "A" }, { title: "B" }] });
  for (const c of created) await t.mutation(api.agent.placeBlock, { task_id: c.id, date: "2026-10-12", start: "10:00", mins: 30 });
  await t.mutation(api.agent.removeBlock, { task_id: created[0].id, date: "2026-10-12" });
  expect((await t.query(api.agent.board, {})).blocks.map((x) => x.task_id)).toEqual([created[1].id]);
});
```

Run `pnpm vitest run convex/agent` and expect it to FAIL, because `api.agent.board` does not exist yet.

- [ ] **Step 2: Implement.** In `convex/model.ts`:

```ts
export async function board(db: R, userId: string, a: { date?: string }, now = new Date()) {
  checkDate(a.date);
  const { t, nowM } = clock(now);
  const date = a.date ?? t;
  const s = await loadState(db, userId, t, date);
  const planned = new Set(s.blocks.filter((b) => b.date === date).map((b) => b.task_id));
  const have = new Set(s.tasks.map((x) => x.id));
  const extra: FullTask[] = [];
  for (const id of planned) {
    if (have.has(id)) continue;
    const d = await db.get(id as Id<"tasks">);
    if (d && d.user_id === userId) extra.push(toTask(d));
  }
  return {
    today: t, date, nowM, app_url: process.env.APP_URL ?? null,
    day: s.days.find((d) => d.date === date) ?? null,
    tasks: [...s.tasks, ...extra],
    blocks: s.blocks.filter((b) => b.date >= addDays(date, -1) && b.date <= addDays(date, 1)),
    suggestions: suggestions({ date, today: t, nowM, tasks: s.tasks, blocks: s.blocks })
      .map((x) => ({ id: x.task.id, title: x.task.title, reasons: x.reasons })),
  };
}

const snap = (m: number) => Math.round(m / 15) * 15;

export async function placeBlock(db: W, userId: string, a: { task_id: string; date: string; start: string; mins: number }) {
  checkDate(a.date);
  const task = await ownedTask(db, userId, a.task_id);
  if (!task) throw new InputError("task not found");
  const s = Math.min(24 * 60 - 15, Math.max(0, snap(toMin(a.start) ?? 0)));
  const mins = Math.max(15, Math.min(1440, snap(a.mins), 24 * 60 - s));
  const existing = (await db.query("plan_blocks").withIndex("by_task", (q) => q.eq("task_id", task._id)).collect())
    .find((b) => b.date === a.date);
  const row = { start: toHM(s), mins };
  if (existing) await db.patch(existing._id, row);
  else await db.insert("plan_blocks", { user_id: userId, date: a.date, task_id: task._id, ...row });
  return { task_id: task._id, date: a.date, ...row };
}

export async function removeBlock(db: W, userId: string, a: { task_id: string; date: string }) {
  return unplan(db, userId, a.date, [a.task_id]);
}
```

Also export `toTask` if needed, and add `ownedTask`, `toHM` and `toMin` imports. In `convex/agent.ts`:

```ts
export const board = query({
  args: { date, now: v.optional(v.number()) },
  handler: async (ctx, { now, ...a }) => m.board(ctx.db, await requireUser(ctx), a, at(now)),
});
export const placeBlock = mutation({
  args: { task_id: v.string(), date: v.string(), start: v.string(), mins: v.number() },
  handler: async (ctx, a) => m.placeBlock(ctx.db, await requireUser(ctx), a).catch(m.asConvexError),
});
export const removeBlock = mutation({
  args: { task_id: v.string(), date: v.string() },
  handler: async (ctx, a) => m.removeBlock(ctx.db, await requireUser(ctx), a),
});
```

Use the existing `at(now)` helper in agent.ts. If it is named differently, use that name.

- [ ] **Step 3:** Run `pnpm vitest run convex` and `pnpm typecheck`, and confirm they are green.
- [ ] **Step 4:** Commit with message `feat(convex): board query and block place/remove mutations`.

---

### Task 2: Quick-add parser

**Model:** haiku

**Files:**
- Create: `shared/quickadd.ts`, `shared/quickadd.test.ts`

**Interfaces:**
- Produces `parseQuickAdd(input: string, today: string, nowM: number): { title: string; due: string | null; time: string | null; priority: "high" | "med" | "low" | null; tags: string[]; estimate_mins: number | null; chips: { kind: "date" | "time" | "priority" | "tag" | "estimate"; text: string }[] }`.

- [ ] **Step 1: Failing tests** in `shared/quickadd.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseQuickAdd } from "./quickadd.ts";

const T = "2026-10-12"; // a Monday
const p = (s: string, nowM = 9 * 60) => parseQuickAdd(s, T, nowM);

describe("parseQuickAdd", () => {
  it("parses the spec example", () => {
    expect(p("Call Sam tomorrow 3pm !high #work ~1h")).toMatchObject({
      title: "Call Sam", due: "2026-10-13", time: "15:00", priority: "high", tags: ["work"], estimate_mins: 60,
    });
  });
  it("keeps a plain title untouched", () => {
    expect(p("Buy milk")).toMatchObject({ title: "Buy milk", due: null, time: null, priority: null, tags: [], estimate_mins: null, chips: [] });
  });
  it("understands today, weekdays (next occurrence) and dates", () => {
    expect(p("x today").due).toBe("2026-10-12");
    expect(p("x fri").due).toBe("2026-10-16");
    expect(p("x mon").due).toBe("2026-10-19");
    expect(p("Plan the wedding").due).toBeNull();
    expect(p("x wednesday").due).toBe("2026-10-14");
    expect(p("x 20 oct").due).toBe("2026-10-20");
    expect(p("x 3/11").due).toBe("2026-11-03");
  });
  it("reads times, with bare hours meaning working hours", () => {
    expect(p("x 9:30am").time).toBe("09:30");
    expect(p("x 15:45").time).toBe("15:45");
    expect(p("lunch with Sam at 1").time).toBe("13:00");
    expect(p("x at 8").time).toBe("08:00");
  });
  it("reads priority shorthands and estimates", () => {
    expect(p("x !").priority).toBe("high");
    expect(p("x !med").priority).toBe("med");
    expect(p("x !low").priority).toBe("low");
    expect(p("x ~45m").estimate_mins).toBe(45);
    expect(p("x ~1h30").estimate_mins).toBe(90);
  });
  it("normalises tags and leaves stray symbols in the title", () => {
    expect(p("x #Deep-Work #c++").tags).toEqual(["deep-work", "c"]);
    expect(p("Email Q&A #work").title).toBe("Email Q&A");
  });
  it("emits chips in input order for the UI", () => {
    expect(p("Call Sam tomorrow 3pm !high").chips.map((c) => c.kind)).toEqual(["date", "time", "priority"]);
  });
});
```

Run `pnpm vitest run quickadd` and expect it to FAIL, because the module is missing.

- [ ] **Step 2: Implement** `shared/quickadd.ts`:

```ts
import { addDays, parseDuration } from "./planning.ts";
import { normTag } from "./validation.ts";

const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const FULL_DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const dow = (d: string) => new Date(d + "T12:00:00Z").getUTCDay();
const pad = (n: number) => String(n).padStart(2, "0");

type Chip = { kind: "date" | "time" | "priority" | "tag" | "estimate"; text: string };

export function parseQuickAdd(input: string, today: string, _nowM: number) {
  let due: string | null = null, time: string | null = null, priority: "high" | "med" | "low" | null = null;
  let estimate_mins: number | null = null;
  const tags: string[] = [];
  const chips: Chip[] = [];
  const keep: string[] = [];
  const words = input.trim().split(/\s+/).filter(Boolean);
  const year = today.slice(0, 4);
  for (let i = 0; i < words.length; i++) {
    const w = words[i], l = w.toLowerCase();
    let m: RegExpExecArray | null;
    if (!due && l === "today") { due = today; chips.push({ kind: "date", text: w }); continue; }
    if (!due && (l === "tomorrow" || l === "tmrw")) { due = addDays(today, 1); chips.push({ kind: "date", text: w }); continue; }
    if (!due && (DAYS.includes(l) || FULL_DAYS.includes(l))) {
      const target = DAYS.indexOf(l.slice(0, 3));
      const ahead = ((target - dow(today) + 7) % 7) || 7;
      due = addDays(today, ahead); chips.push({ kind: "date", text: w }); continue;
    }
    if (!due && /^\d{1,2}$/.test(w) && MONTHS.includes((words[i + 1] ?? "").toLowerCase().slice(0, 3))) {
      due = `${year}-${pad(MONTHS.indexOf(words[i + 1].toLowerCase().slice(0, 3)) + 1)}-${pad(+w)}`;
      chips.push({ kind: "date", text: `${w} ${words[i + 1]}` }); i++; continue;
    }
    if (!due && (m = /^(\d{1,2})\/(\d{1,2})$/.exec(w))) {
      due = `${year}-${pad(+m[2])}-${pad(+m[1])}`; chips.push({ kind: "date", text: w }); continue;
    }
    if (!time && (m = /^(\d{1,2})(?::(\d{2}))?(am|pm)$/i.exec(w))) {
      let h = +m[1] % 12; if (m[3].toLowerCase() === "pm") h += 12;
      time = `${pad(h)}:${m[2] ?? "00"}`; chips.push({ kind: "time", text: w }); continue;
    }
    if (!time && (m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(w))) {
      time = `${pad(+m[1])}:${m[2]}`; chips.push({ kind: "time", text: w }); continue;
    }
    if (!time && l === "at" && /^\d{1,2}$/.test(words[i + 1] ?? "")) {
      let h = +words[i + 1]; if (h >= 1 && h <= 6) h += 12; // ponytail: bare hours 1–6 mean pm (working hours)
      time = `${pad(h)}:00`; chips.push({ kind: "time", text: `at ${words[i + 1]}` }); i++; continue;
    }
    if (!priority && (m = /^!(high|med|medium|low)?$/i.exec(w))) {
      const v = (m[1] ?? "high").toLowerCase();
      priority = v === "medium" ? "med" : (v as "high" | "med" | "low"); chips.push({ kind: "priority", text: w }); continue;
    }
    if (/^#\S+$/.test(w)) {
      const t = normTag(w); if (t && !tags.includes(t)) { tags.push(t); chips.push({ kind: "tag", text: w }); }
      continue;
    }
    if (!estimate_mins && /^~\S+$/.test(w)) {
      const n = parseDuration(w.slice(1));
      if (typeof n === "number" && Number.isFinite(n) && n > 0) { estimate_mins = n; chips.push({ kind: "estimate", text: w }); continue; }
    }
    keep.push(w);
  }
  return { title: keep.join(" "), due, time, priority, tags, estimate_mins, chips };
}
```

- [ ] **Step 3:** Run `pnpm vitest run quickadd` and confirm it passes. Then run `pnpm typecheck`.
- [ ] **Step 4:** Commit with message `feat(shared): quick-add parser`.

---

### Task 3: Measure the comp (impeccable spec phase)

**Model:** controller (this needs vision on the comp; the build thread owns the comp)

**Files:**
- Create: `apps/web/.impeccable/build/regions.json` and `apps/web/.impeccable/build/spec.json` (tool output)

- [ ] Run `impeccable comp-spec --comp .impeccable/mocks/comp-1.png --grid` from `apps/web`, then open the grid.
- [ ] Write `regions.json`. Name every region:
  - the top bar items
  - Day plan header, hour labels, each event block, each task block, the now-line
  - To do header, span label, quick-add field, Add button, each parsed chip
  - Next up strip and each of its 3 items
  - Carried over header and count, each docket, the steel rail
  - Today header and count, each docket, the biro ring
  - Coming up row, footer legend, Bumped/High legend

  Classify each region by what it is:
  - Docket paper with its perforated edge, and the brushed steel rails, are `texture`/`plate`.
  - The biro ring is a `plate`.
  - Everything else is `text`/`control`/`chrome`.
- [ ] Run `impeccable comp-spec --comp .impeccable/mocks/comp-1.png --regions .impeccable/build/regions.json`.
- [ ] Run `impeccable font-match --measure` on each text region, then `--rank` on the lead text regions: the date line, a docket title, and a mono time.
- [ ] Run `impeccable build-phase advance` and get the gate to pass.

---

### Task 4: Plates (impeccable plates phase)

**Model:** the shipped `impeccable-asset-producer` subagent

- [ ] Dispatch `impeccable-asset-producer` with `apps/web/.impeccable/build/spec.json`. It produces every plate and texture: docket paper with its perforated top edge, the brushed steel rail texture, and the biro ring on a transparent background. Each is generated at asset resolution with its embedded prompt.
- [ ] Run `impeccable build-phase advance` and get the gate to pass.

---

### Task 5: Hero: first viewport at comp fidelity

**Model:** opus (impeccable marks the hero gate as frontier-tier)

**Files:**
- Create: `apps/web/src/ui/` components: `TopBar`, `DayPlan` (static rendering), `TodoPanel`, `Docket`, `Rail`, `NextUp`, `QuickAdd` (static), and `fixtures.ts`, which holds the comp's exact content.
- Create: `apps/web/src/styles/tokens.css` (palette, type, spacing taken from spec.json; light and dark).
- Modify: `apps/web/src/App.tsx`, so that Home renders the hero from fixtures when `?fixture=1` is set.

- [ ] Run `impeccable build-phase scaffold`, then bind `layout.css`'s measured numbers to semantic elements (one element per region).
- [ ] Place every plate before any text.
- [ ] Set the comp's words verbatim from `fixtures.ts`, in the ranked faces at the measured cap heights.
- [ ] Capture `.impeccable/review/hero-repro.png` at 1536×1024, then run `impeccable build-phase record hero` and `impeccable build-phase advance`. The gate needs ≥72% with no hard veto. Fix the numeric advisories it prints.
- [ ] Commit with message `feat(web): The Pass hero at comp fidelity`.

---

### Task 6: Live data, docket list, grouping and View menu

**Model:** sonnet

**Files:**
- Create:
  - `shared/board.ts` (pure: `groupTasks(tasks, today, view)` → groups Carried over / Today / Done today / Coming up, or by due / priority / tag / source; `sortTasks`; `spanOf(tasks)`), with `shared/board.test.ts`
  - `apps/web/src/lib/useBoard.ts`: `useMinuteTick` + `useQuery(api.agent.board, {date, now})`
  - `apps/web/src/ui/ViewMenu.tsx`
- Modify: `TodoPanel`, `Docket`, `App.tsx`. Home renders live data; fixtures stay as test data only.

Behaviour:
- **Groups:** match the artifact. Carried over shows "waiting N days". Done today is kept. Coming up is collapsed by default.
- **View menu:** one control holds group (status/due/priority/tag/source), sort (manual/due/priority/time/tag) and tag filter (All, each tag, Untagged). Its state is stored in localStorage.
- **Docket meta:** at most 3 tags. The source label (Jira key/Gmail) goes in mono. "Next up" shows the board's suggestions with their reasons (max 3), plus "Plan all".
- **Span header:** the first and last time of the dockets in view, recomputed as you scroll (IntersectionObserver).
- **Biro ring:** on the top suggestion's docket.

Tests:
- `shared/board.test.ts` (group/sort/filter cases mirroring the artifact's `render()` logic).
- `TodoPanel.test.tsx` renders groups and counts from a fixture board.

- [ ] TDD the pure module. Then wire it, run `pnpm test` and `pnpm typecheck`, and commit.

---

### Task 7: Quick add, edit sheet, tick, delete, undo

**Model:** sonnet

**Files:**
- Create: `apps/web/src/ui/EditSheet.tsx`, `apps/web/src/ui/Toast.tsx`, `apps/web/src/lib/useActions.ts`
- Modify: `QuickAdd`, `Docket`

Behaviour:
- **QuickAdd:** uses `parseQuickAdd` (task 2). Chips show live. Enter calls `api.agent.addTasks` with `source: "you"`. On failure the input is restored and an error toast shows.
- **Tick:** `updateTask {done}` with an optimistic update (`useMutation(...).withOptimisticUpdate`), followed by an Undo toast.
- **Delete:** `deleteTask`, followed by an Undo toast that re-adds the same fields and block.
- **Edit sheet:** a side sheet on desktop and a bottom sheet under 820px. It edits title, description, note, link, due, time, priority, estimate (accepting "1h 30m") and tags. Escape cancels.
- **Undo toast:** a single toast with a countdown ring drained over 5s. It covers tick, delete, plan and unplan.

Tests:
- QuickAdd submits the parsed payload.
- Undo calls the inverse mutation.
- A rejected mutation shows the error toast and reverts the tick (mock `convex/react`).

- [ ] TDD, wire, verify, commit.

---

### Task 8: Timeline (the line)

**Model:** opus

**Files:**
- Create: `apps/web/src/ui/Timeline.tsx`, `apps/web/src/ui/SlotPicker.tsx`, `apps/web/src/lib/timeline.ts` (pure: px↔minutes, snap, clamp, hit-testing; reuses `layoutLanes` / `timedEvents`), plus tests.

Behaviour:
- **Range and markers:** default range 06:00–22:00, widened to fit. All-day events show as chips at the top. Timed events and planned dockets are laid out in lanes. The now-line pulses gently.
- **Day navigation:** `‹ ›` buttons, a date picker, and "Back to today". Changing day uses a View Transition.
- **Blocks:**
  - drag to move and pull the bottom edge to resize, with 15m snap and clamping per Review Focus #1, calling `placeBlock`
  - tick with the block checkbox, remove with the `×`, calling `removeBlock`
  - keyboard: arrows move ±15m, Shift+arrows resize
- **Empty slot:** click (or Enter on a focused slot) to open the SlotPicker, with search, suggestions first, and "create new" via `parseQuickAdd`. It is a popover on desktop and a bottom sheet on mobile.
- **Below the timeline:** a "Done that day" list.

Tests:
- Pure maths (snap, clamp, lanes).
- Keyboard move calls `placeBlock` with snapped values.
- Picker create path.

- [ ] TDD, wire, verify, commit.

---

### Task 9: Drag and drop (dnd-kit)

**Model:** sonnet

**Files:**
- Create: `apps/web/src/ui/DndProvider.tsx`
- Modify: `Rail`/`TodoPanel` (sortable), `Timeline` (droppable)

Behaviour:
- **Reorder:** within a group, under manual sort only. It sets `sort_order` to the midpoint of its neighbours via `updateTask`, optimistically.
- **Plan by drag:** dragging a docket onto the timeline places a block at the drop time with `defaultBlockMins`. A shared layout animation morphs the docket into the block.
- **Plan by key:** `p` on a focused task plans it into the first free slot via `api.agent.plan` with `task_ids: [id]` and `commit: true`.
- **Plan all:** in Next up, the same call with all suggestion ids.

Tests:
- `sortOrderBetween` (pure).
- Keyboard reorder calls `updateTask` with the midpoint.

- [ ] TDD, wire, verify, commit.

---

### Task 10: Presets, divider, shortcuts, help

**Model:** sonnet

**Files:**
- Create: `apps/web/src/ui/Panes.tsx`, `apps/web/src/lib/shortcuts.ts`, `apps/web/src/ui/HelpSheet.tsx`

Behaviour:
- **Divider:** drag, arrow keys ±2%, double-click to reset. Clamped to 25–75%.
- **Presets:** Capture/Plan/Focus snap the divider and glide with springs. In Focus, the list crossfades to its compact column.
- **Shortcuts:** the full set in Global Constraints, ignored while typing in inputs.
- **Help:** `?` opens the help sheet listing them.

Tests:
- The shortcut dispatcher maps keys to actions and skips inputs.
- The divider clamps its value and persists it to localStorage.

- [ ] TDD, wire, verify, commit.

---

### Task 11: Motion pass (impeccable sections + motion phases)

**Model:** sonnet

- [ ] Run `impeccable build-phase advance` through **sections** (task 6–10's surfaces inside the spec's system).
- [ ] Implement every moment in the spec's Motion & flourishes section with `motion`:
  - tick draw + settle + progress spring
  - last-task celebration
  - chips pop and row fly-in on add
  - docket→block morph and snap spring
  - preset glide
  - day-nav view transition
  - sheets springing from origin, with backdrop blur
  - morning-arrival stagger + headline fade
  - undo ring

  All of these respect reduced motion.
- [ ] `impeccable build-phase advance` (motion).
- [ ] Commit.

---

### Task 12: Mobile, responsive phase, PWA

**Model:** sonnet

- [ ] Under 820px, show bottom tabs Today/Plan:
  - swipe right to tick and swipe left for Plan/Tomorrow, with `motion` drag gestures and thresholds
  - a thumb-reach add button opening QuickAdd in a sheet
  - safe-area insets
- [ ] Add `vite-plugin-pwa`:
  - manifest (name toodoo, theme colour from tokens, icons generated from the wordmark as a plate with provenance)
  - app-shell precache
  - runtime cache of the last board response for offline reading
  - writes disabled offline, with a subtle offline badge
- [ ] Capture `desktop.png` (1440 wide) and `mobile.png` (390 wide) into `.impeccable/review/`, then run `impeccable build-phase advance` (responsive).
- [ ] Commit.

---

### Task 13: Finish: review, detector, DESIGN.md

**Model:** controller + the shipped agents

- [ ] Run `impeccable detect --json` on `apps/web/src` and fix the mechanical findings.
- [ ] Run `impeccable comp-diff --comp .impeccable/mocks/comp-1.png --build .impeccable/review/desktop.png --spec .impeccable/build/spec.json --out-dir .impeccable/review/diff/final`.
- [ ] Spawn `impeccable-finish-reviewer` with the packet from new-work.md §7: request, answers, direction contract, screenshots, comp, spec, diffs, and the craft-floor path. Act on its disposition, within two rounds.
- [ ] Spawn `impeccable-documenter` to write `apps/web/DESIGN.md`.
- [ ] Commit.

---

### Task 14: Cloud cutover (with Steve)

**Model:** controller, attended. These steps touch Steve's accounts, so each is confirmed with him.

- [ ] Steve: `npx workos profile claim`, Sign-out URI, CIMD + DCR enabled.
- [ ] `pnpm convex login`, `pnpm dev:cloud` (creates the cloud dev deployment), then set its env vars, following `docs/setup.md`.
- [ ] Production:
  - prod WorkOS client and AuthKit domain
  - prod Convex env
  - Vercel project with `CONVEX_DEPLOY_KEY` (Production only) and `VITE_WORKOS_*`
  - push to GitHub, first deploy
- [ ] Steve signs in on prod. Set prod `ALLOWED_USER_ID`, then run the import against prod and check the counts and dropped-block report.
- [ ] Claude connector: add `https://<prod>.convex.site/mcp` with the Resource Indicator set. Smoke-test `get_snapshot`, `suggest` and `plan` in a chat.
- [ ] Routine switch: push the repo so the `plugin/` marketplace is reachable. Then update the morning routine (via RemoteTrigger, after Steve approves the exact change): prompt "Use the toodoo skill to run the morning plan." followed by a **Personal settings** block (noise calendars, duplicate calendars, Atlassian cloudId) copied from the gitignored `docs/private/routine-settings.md`, toodoo plugin enabled, toodoo connector added, ArtifactData dropped. Run it once on demand and check the result.
- [ ] Retire the artifact: leave it read-only. Deleting it is Steve's call.
