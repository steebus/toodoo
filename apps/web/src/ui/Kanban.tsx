import { useMemo, useState, type KeyboardEvent } from "react";
import { NO_EPIC, sortTasks } from "@shared/board.ts";
import { epicMap, TASK_STATUS_LABEL, TASK_STATUSES, type TaskStatus } from "@shared/epics.ts";
import { addDays, byOrder } from "@shared/planning.ts";
import type { FullTask } from "@shared/snapshot.ts";
import { laneStep, orderAt, type Drop, type Lane } from "../lib/lanes";
import type { WorkActions, WorkData } from "../lib/useWork";
import { EditSheet } from "./EditSheet";
import { LaneDnd, LaneList } from "./LaneDnd";
import { LaneAdd, SlipGhost, SortableSlip } from "./Slip";
import { TaskView } from "./TaskView";
import { Toast } from "./Toast";

type Column = TaskStatus | "done";
const COLUMNS: Column[] = [...TASK_STATUSES, "done"];
const label = (c: Column) => (c === "done" ? "Done" : TASK_STATUS_LABEL[c]);
export const columnOf = (t: FullTask): Column => (t.done ? "done" : t.status ?? "todo");

type Prefs = { epic: string; sort: "manual" | "priority" };
const KEY = "toodoo.boardView";
function loadPrefs(): Prefs {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Prefs> | null;
    return { epic: typeof raw?.epic === "string" ? raw.epic : "", sort: raw?.sort === "priority" ? "priority" : "manual" };
  } catch {
    return { epic: "", sort: "manual" };
  }
}

// The task columns, in the order shown. Done shows the last fortnight, newest first.
export function columns(work: WorkData, prefs: Prefs): Record<Column, FullTask[]> {
  const shown = work.tasks.filter((t) => !prefs.epic || (prefs.epic === NO_EPIC ? !t.epic_id : t.epic_id === prefs.epic));
  const out = Object.fromEntries(COLUMNS.map((c) => [c, [] as FullTask[]])) as Record<Column, FullTask[]>;
  for (const t of shown) out[columnOf(t)].push(t);
  for (const c of TASK_STATUSES) out[c] = prefs.sort === "priority" ? sortTasks(out[c], "priority", work.epics) : out[c].sort(byOrder);
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
  const [editing, setEditing] = useState<string | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const editTask = editing ? byId.get(editing) : undefined;
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
  const onKey = (id: string, e: KeyboardEvent) => {
    if (off || (e.key !== "[" && e.key !== "]")) return;
    const to = laneStep(lanes, id, e.key === "]" ? 1 : -1);
    if (!to) return;
    e.preventDefault();
    drop(id, { lane: to, index: cols[to as Column].filter((x) => x.id !== id).length });
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-slip="${id}"]`)?.focus());
  };

  const filterEpic = view.epic && view.epic !== NO_EPIC ? view.epic : null;
  const openCount = cols.todo.length + cols.doing.length + cols.blocked.length;
  return (
    <main className="room-main kanban">
      <div className="room-head">
        <h1 className="room-title">Board</h1>
        <span className="count-chip">{openCount}</span>
        <span className="room-head-gap" />
        <label className="room-pick">
          <span>Epic</span>
          <select value={view.epic} onChange={(e) => setPrefs({ ...view, epic: e.target.value })}>
            <option value="">All</option>
            {work.epics.filter((e) => e.status !== "done" || e.id === view.epic).map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
            <option value={NO_EPIC}>No epic</option>
          </select>
        </label>
        <label className="room-pick">
          <span>Sort</span>
          <select value={view.sort} onChange={(e) => setPrefs({ ...view, sort: e.target.value as Prefs["sort"] })}>
            <option value="manual">Manual</option>
            <option value="priority">Priority</option>
          </select>
        </label>
      </div>
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
        <div className="kanban-cols">
          {COLUMNS.map((c) => (
            <section key={c} className={`kanban-col is-${c}`} aria-labelledby={`col-${c}`}>
              <h2 id={`col-${c}`} className="lane-label">
                {label(c)}
                <span className="count-chip">{cols[c].length}</span>
              </h2>
              {c === "todo" && (
                <LaneAdd today={work.today} label="Add a task" disabled={off} onAdd={actions.add} epics={work.epics}
                  extra={{ status: "todo", epic_id: filterEpic }} />
              )}
              <LaneList id={c} ids={lanes.find((l) => l.id === c)!.ids} className="lane" label={label(c)}>
                {cols[c].map((t) => (
                  <SortableSlip key={t.id} lane={c} task={t} epic={t.epic_id ? epics.get(t.epic_id) : undefined} today={work.today}
                    showEpic={!filterEpic} onOpen={setViewing} onKey={onKey} disabled={off} />
                ))}
              </LaneList>
            </section>
          ))}
        </div>
      </LaneDnd>
      {viewTask && (
        <TaskView key={viewTask.id} task={viewTask} today={work.today} offline={off}
          epic={viewTask.epic_id ? epics.get(viewTask.epic_id) : undefined}
          onClose={() => setViewing(null)}
          onTick={(done) => actions.move(viewTask.id, { done }, `${done ? "Done" : "Reopened"}: ${viewTask.title}`)}
          onStatus={(s) => actions.move(viewTask.id, { status: s }, `${TASK_STATUS_LABEL[s]}: ${viewTask.title}`)}
          onTomorrow={() => void actions.save(viewTask.id, { due: addDays(work.today, 1) })}
          onEdit={() => { setViewing(null); setEditing(viewTask.id); }}
          onDelete={() => actions.remove(viewTask.id)} />
      )}
      {editTask && (
        <EditSheet key={editTask.id} task={editTask} epics={work.epics} offline={off}
          onSave={(id, patch) => void actions.save(id, patch)} onDelete={actions.remove} onClose={() => setEditing(null)} />
      )}
      <Toast toast={actions.toast} onDismiss={actions.dismiss} />
    </main>
  );
}
