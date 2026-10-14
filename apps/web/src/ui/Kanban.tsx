import { useMemo, useState, type KeyboardEvent } from "react";
import { NO_EPIC, sortTasks } from "@shared/board.ts";
import { epicMap, TASK_STATUS_LABEL, TASK_STATUSES, type TaskStatus } from "@shared/epics.ts";
import { addDays, byOrder, formatDuration } from "@shared/planning.ts";
import type { FullTask } from "@shared/snapshot.ts";
import { laneStep, orderAt, type Drop, type Lane } from "../lib/lanes";
import type { WorkActions, WorkData } from "../lib/useWork";
import { useDroppable } from "@dnd-kit/core";
import { useNarrow } from "../lib/useNarrow";
import { LaneDnd, LaneList, TAB } from "./LaneDnd";
import { LaneAdd, SlipGhost, SortableSlip } from "./Slip";
import { ChevronIcon } from "./icons";
import { HeaderControls } from "./RoomShell";
import { TaskView } from "./TaskView";
import { SettingsMenu, SettingsPick } from "./ViewMenu";
import { Toast } from "./Toast";

type Column = TaskStatus | "done";
const COLUMNS: Column[] = [...TASK_STATUSES, "done"];
const label = (c: Column) => (c === "done" ? "Done" : TASK_STATUS_LABEL[c]);
export const columnOf = (t: FullTask): Column => (t.done ? "done" : t.status ?? "todo");

const SORTS = [["manual", "Manual"], ["priority", "Priority"], ["effort", "Effort"], ["due", "Due date"]] as const;
type Prefs = { epic: string; sort: (typeof SORTS)[number][0]; folded?: Column[] };
const KEY = "toodoo.boardView";
function loadPrefs(): Prefs {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Prefs> | null;
    return {
      epic: typeof raw?.epic === "string" ? raw.epic : "",
      sort: SORTS.find(([v]) => v === raw?.sort)?.[0] ?? "manual",
      folded: Array.isArray(raw?.folded) ? raw.folded.filter((c) => COLUMNS.includes(c)) : [],
    };
  } catch {
    return { epic: "", sort: "manual", folded: [] };
  }
}

// The task columns, in the order shown. Done shows the last fortnight, newest first.
export function columns(work: WorkData, prefs: Prefs): Record<Column, FullTask[]> {
  const shown = work.tasks.filter((t) => !prefs.epic || (prefs.epic === NO_EPIC ? !t.epic_id : t.epic_id === prefs.epic));
  const out = Object.fromEntries(COLUMNS.map((c) => [c, [] as FullTask[]])) as Record<Column, FullTask[]>;
  for (const t of shown) out[columnOf(t)].push(t);
  for (const c of TASK_STATUSES) out[c] = prefs.sort === "manual" ? out[c].sort(byOrder) : sortTasks(out[c].sort(byOrder), prefs.sort, work.epics);
  out.done.sort((a, b) => (b.done_on ?? "").localeCompare(a.done_on ?? "") || byOrder(a, b));
  return out;
}

// What a task needs to land in a column at a place: done is the task's own flag; the rest is its status.
export function movePatch(t: FullTask, to: Column, order?: number): Partial<FullTask> {
  const p: Partial<FullTask> = {};
  if (to === "done") {
    if (!t.done) p.done = true;
  } else {
    if (t.done) p.done = false;
    if ((t.status ?? "todo") !== to) p.status = to;
    if (order !== undefined && order !== t.sort_order) p.sort_order = order;
  }
  return p;
}

export function Kanban({ work, actions }: { work: WorkData; actions: WorkActions }) {
  const [prefs, setPrefsState] = useState(loadPrefs);
  const setPrefs = (p: Prefs) => {
    setPrefsState(p);
    try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* the choice holds for this visit */ }
  };
  // An epic that has gone (deleted elsewhere) would hide everything: show all instead.
  const epicGone = !!prefs.epic && prefs.epic !== NO_EPIC && !work.epics.some((e) => e.id === prefs.epic);
  const view = useMemo(() => (epicGone ? { ...prefs, epic: "" } : prefs), [epicGone, prefs]);
  const cols = useMemo(() => columns(work, view), [work, view]);
  const epics = useMemo(() => epicMap(work.epics), [work.epics]);
  const byId = useMemo(() => new Map(work.tasks.map((t) => [t.id, t])), [work.tasks]);
  const lanes: Lane[] = COLUMNS.map((c) => ({ id: c, ids: cols[c].map((t) => t.id) }));
  // On the phone, one column at a time under tabs (which take drops too); on a desktop, all four.
  const narrow = useNarrow();
  const [shown, setShown] = useState<Column>("todo");
  const [viewing, setViewing] = useState<string | null>(null);
  const viewTask = viewing ? byId.get(viewing) : undefined;
  const manual = view.sort === "manual";
  const off = actions.offline;

  const drop = (id: string, to: Drop) => {
    const t = byId.get(id);
    if (!t) return;
    const lane = to.lane as Column;
    const rest = cols[lane].filter((x) => x.id !== id);
    const order = manual && lane !== "done" ? orderAt(rest.map((x) => x.sort_order), to.index) : undefined;
    const patch = movePatch(t, lane, order);
    if (!Object.keys(patch).length) return;
    actions.move(id, patch, columnOf(t) === lane ? `Moved: ${t.title}` : `${label(lane)}: ${t.title}`);
  };

  // [ and ] move a focused card a column left or right, to the foot of that column.
  const toFoot = (id: string, to: Column) => drop(id, { lane: to, index: cols[to].filter((x) => x.id !== id).length });
  const onKey = (id: string, e: KeyboardEvent) => {
    if (off || (e.key !== "[" && e.key !== "]")) return;
    const to = laneStep(lanes, id, e.key === "]" ? 1 : -1);
    if (!to) return;
    e.preventDefault();
    toFoot(id, to as Column);
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-slip="${id}"]`)?.focus());
  };
  // On the phone a card swipes across the columns, to the foot of the one it lands in.
  const names = COLUMNS.map(label);
  const swipeFor = (t: FullTask) => narrow && !off
    ? { columns: names, from: COLUMNS.indexOf(columnOf(t)), onMove: (i: number) => toFoot(t.id, COLUMNS[i]) }
    : undefined;

  const filterEpic = view.epic && view.epic !== NO_EPIC ? view.epic : null;
  // A column folds to a thin strip where it stands (the phone shows one column at a time, so never there).
  const isFolded = (c: Column) => !narrow && !!view.folded?.includes(c);
  const fold = (c: Column) => {
    const f = view.folded ?? [];
    setPrefs({ ...view, folded: f.includes(c) ? f.filter((x) => x !== c) : [...f, c] });
  };
  return (
    <main className="room-main kanban">
      <h1 className="sr-only">Board</h1>
      <HeaderControls>
        <SettingsMenu>
          <SettingsPick label="Epic" value={view.epic}
            options={[["", "All"], ...work.epics.filter((e) => e.status !== "done" || e.id === view.epic).map((e): [string, string] => [e.id, e.title]), [NO_EPIC, "No epic"]]}
            onChange={(epic) => setPrefs({ ...view, epic })} />
          <SettingsPick label="Sort" value={view.sort} options={SORTS.map(([v, l]): [string, string] => [v, l])}
            onChange={(sort) => setPrefs({ ...view, sort: sort as Prefs["sort"] })} />
        </SettingsMenu>
      </HeaderControls>
      <LaneDnd
        lanes={lanes}
        disabled={off}
        titleOf={(id) => byId.get(id)?.title ?? "task"}
        laneName={(l) => label(l as Column)}
        onDrop={drop}
        ghost={(id) => {
          const t = byId.get(id);
          return t ? <SlipGhost task={t} epic={t.epic_id ? epics.get(t.epic_id) : undefined} today={work.today} showEpic={!filterEpic} /> : null;
        }}
      >
        {narrow && (
          <div className="kb-tabs" role="tablist" aria-label="Columns">
            {COLUMNS.map((c) => <ColumnTab key={c} column={c} count={cols[c].length} on={shown === c} onSelect={() => setShown(c)} />)}
          </div>
        )}
        <div className="kanban-cols"
          style={narrow ? undefined : { gridTemplateColumns: COLUMNS.map((c) => (isFolded(c) ? "52px" : "minmax(220px, 1fr)")).join(" ") }}>
          {COLUMNS.filter((c) => !narrow || c === shown).map((c) => isFolded(c) ? (
            <FoldedColumn key={c} column={c} tasks={cols[c]} onUnfold={() => fold(c)} />
          ) : (
            <section key={c} className={`kanban-col is-${c}`} aria-labelledby={`col-${c}`}>
              <h2 id={`col-${c}`} className="lane-label">
                {label(c)}
                <span className="count-chip">{cols[c].length}</span>
                {!narrow && (
                  <button type="button" className="lane-fold" aria-label={`Fold ${label(c)}`} title="Fold" onClick={() => fold(c)}>
                    <ChevronIcon size={18} />
                  </button>
                )}
              </h2>
              {c === "todo" && (
                <LaneAdd today={work.today} label="Add a task" disabled={off} onAdd={actions.add} epics={work.epics}
                  extra={{ status: "todo", epic_id: filterEpic }} />
              )}
              <LaneList id={c} ids={lanes.find((l) => l.id === c)!.ids} className="lane" label={label(c)}>
                {cols[c].map((t) => (
                  <SortableSlip key={t.id} lane={c} task={t} epic={t.epic_id ? epics.get(t.epic_id) : undefined} today={work.today}
                    showEpic={!filterEpic} onOpen={setViewing} onKey={onKey} disabled={off} swipe={swipeFor(t)} />
                ))}
              </LaneList>
            </section>
          ))}
        </div>
      </LaneDnd>
      {viewTask && (
        <TaskView key={viewTask.id} task={viewTask} today={work.today} offline={off} epics={work.epics}
          tagPool={[...new Set(work.tasks.flatMap((t) => t.tags))].sort()}
          epic={viewTask.epic_id ? epics.get(viewTask.epic_id) : undefined}
          onClose={() => setViewing(null)}
          onTick={(done) => actions.move(viewTask.id, { done }, `${done ? "Done" : "Reopened"}: ${viewTask.title}`)}
          onTomorrow={() => void actions.save(viewTask.id, { due: addDays(work.today, 1) })}
          onSave={(patch) => actions.save(viewTask.id, patch)}
          onDelete={() => actions.remove(viewTask.id)} />
      )}
      <Toast toast={actions.toast} onDismiss={actions.dismiss} />
    </main>
  );
}

// A folded column: its name up the strip, how many and how much work, and high-priority ones counted. It still
// takes a dropped card (to its foot), and a click opens it out again.
function FoldedColumn({ column, tasks, onUnfold }: { column: Column; tasks: FullTask[]; onUnfold: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `${TAB}${column}`, data: { type: "lane" } });
  const mins = tasks.reduce((n, t) => n + (t.estimate_mins ?? 0), 0);
  const high = tasks.filter((t) => t.priority === "high").length;
  return (
    <button ref={setNodeRef} type="button" className={`kanban-fold is-${column}${isOver ? " is-over" : ""}`} aria-expanded={false}
      aria-label={`Unfold ${label(column)}, ${tasks.length}`} title="Unfold" onClick={onUnfold}>
      <span className="count-chip">{tasks.length}</span>
      <span className="kanban-fold-name">{label(column)}</span>
      {mins > 0 && <span className="kanban-fold-sum">~{formatDuration(mins)}</span>}
      {high > 0 && <span className="kanban-fold-sum is-high">{high} high</span>}
    </button>
  );
}

// A column's tab on the phone: its name and count; pick it to show that column, or drop a card on it to move the
// card there (to the column's foot).
function ColumnTab({ column, count, on, onSelect }: { column: Column; count: number; on: boolean; onSelect: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `${TAB}${column}`, data: { type: "lane" } });
  return (
    <button ref={setNodeRef} type="button" role="tab" aria-selected={on} className={`kb-tab${isOver ? " is-over" : ""}`} onClick={onSelect}>
      <span className="kb-tab-name">{label(column)}</span>
      <span className="count-chip">{count}</span>
    </button>
  );
}
