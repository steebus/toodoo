import { useDroppable } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMemo, useState, type ReactNode } from "react";
import { byEpicRank, EPIC_STATUSES, EPIC_STATUS_LABEL, epicMap, type Epic } from "@shared/epics.ts";
import { byOrder } from "@shared/planning.ts";
import type { FullTask } from "@shared/snapshot.ts";
import { orderAt, type Drop, type Lane } from "../lib/lanes";
import type { WorkActions, WorkData } from "../lib/useWork";
import { EditSheet } from "./EditSheet";
import { EpicSheet } from "./EpicSheet";
import { ChevronIcon, CloseIcon, GripIcon, PlusIcon } from "./icons";
import { justDropped, LaneDnd, LaneList } from "./LaneDnd";
import { LaneAdd, SlipGhost, SlipPrint } from "./Slip";
import { Toast } from "./Toast";

const NONE = "__none"; // the lane of tasks with no epic
const PRIORITY_LABEL = { high: "High", med: "Medium", low: "Low" } as const;

const KEY = "toodoo.epicsView";
type Prefs = { showDone: boolean; open: Record<string, boolean> };
function loadPrefs(): Prefs {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Prefs> | null;
    return { showDone: raw?.showDone === true, open: raw?.open && typeof raw.open === "object" ? raw.open : {} };
  } catch {
    return { showDone: false, open: {} };
  }
}
// Active and planned epics start open; on hold, done and the unfiled pile start closed.
const openByDefault = (e?: Epic) => !!e && (e.status === "active" || e.status === "planned");

export function Epics({ work, actions }: { work: WorkData; actions: WorkActions }) {
  const [prefs, setPrefsState] = useState(loadPrefs);
  const setPrefs = (p: Prefs) => {
    setPrefsState(p);
    try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* holds for this visit */ }
  };
  const [sheet, setSheet] = useState<string | "new" | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const off = actions.offline;

  const ranked = useMemo(() => [...work.epics].sort(byEpicRank), [work.epics]);
  const shown = prefs.showDone ? ranked : ranked.filter((e) => e.status !== "done");
  const hiddenDone = ranked.length - shown.length;
  const epics = useMemo(() => epicMap(work.epics), [work.epics]);
  const byId = useMemo(() => new Map(work.tasks.map((t) => [t.id, t])), [work.tasks]);
  // Each epic lists its open tasks in manual order; tasks in a hidden (done) epic stay where they are.
  const lists = useMemo(() => {
    const m = new Map<string, FullTask[]>([[NONE, []], ...work.epics.map((e) => [e.id, []] as [string, FullTask[]])]);
    for (const t of work.tasks) if (!t.done) m.get(t.epic_id && m.has(t.epic_id) ? t.epic_id : NONE)!.push(t);
    for (const l of m.values()) l.sort(byOrder);
    return m;
  }, [work]);
  const lanes: Lane[] = [...shown.map((e) => e.id), NONE].map((id) => ({ id, ids: lists.get(id)!.map((t) => t.id) }));
  const isOpen = (id: string) => prefs.open[id] ?? openByDefault(epics.get(id));
  const toggle = (id: string) => setPrefs({ ...prefs, open: { ...prefs.open, [id]: !isOpen(id) } });
  const nameOf = (lane: string) => (lane === NONE ? "No epic" : epics.get(lane)?.title ?? "epic");

  const drop = (id: string, to: Drop) => {
    const t = byId.get(id);
    if (!t) return;
    const epic_id = to.lane === NONE ? null : to.lane;
    const rest = lists.get(to.lane)!.filter((x) => x.id !== id);
    const order = orderAt(rest.map((x) => x.sort_order), to.index);
    const patch: Partial<FullTask> = {};
    if ((t.epic_id ?? null) !== epic_id) patch.epic_id = epic_id;
    if (order !== t.sort_order) patch.sort_order = order;
    if (!Object.keys(patch).length) return;
    actions.move(id, patch, !("epic_id" in patch) ? `Moved: ${t.title}` : epic_id ? `Into ${nameOf(epic_id)}: ${t.title}` : `Out of ${nameOf(t.epic_id!)}: ${t.title}`);
  };
  const unfile = (t: FullTask) => actions.move(t.id, { epic_id: null }, `Out of ${nameOf(t.epic_id!)}: ${t.title}`);

  const editEpic = sheet && sheet !== "new" ? epics.get(sheet) : undefined;
  const editTask = editing ? byId.get(editing) : undefined;
  const strip = (t: FullTask, lane: string) => (
    <EpicStrip key={t.id} task={t} lane={lane} epic={t.epic_id ? epics.get(t.epic_id) : undefined} today={work.today}
      disabled={off} onOpen={setEditing} onUnfile={lane === NONE ? undefined : () => unfile(t)} />
  );

  return (
    <main className="room-main epics">
      <div className="room-head">
        <h1 className="room-title">Epics</h1>
        <span className="count-chip">{shown.length}</span>
        <span className="room-head-gap" />
        {(hiddenDone > 0 || prefs.showDone) && (
          <button type="button" className="room-toggle" aria-pressed={prefs.showDone} onClick={() => setPrefs({ ...prefs, showDone: !prefs.showDone })}>
            {prefs.showDone ? "Hide done" : `Show done`}
            {!prefs.showDone && <span className="count-chip">{hiddenDone}</span>}
          </button>
        )}
        <button type="button" className="room-button" disabled={off} onClick={() => setSheet("new")}>
          <PlusIcon size={15} /> New epic
        </button>
      </div>
      <LaneDnd lanes={lanes} disabled={off} titleOf={(id) => byId.get(id)?.title ?? "task"} laneName={nameOf} onDrop={drop}
        ghost={(id) => {
          const t = byId.get(id);
          return t ? <SlipGhost task={t} epic={t.epic_id ? epics.get(t.epic_id) : undefined} today={work.today} variant="strip" showStatus /> : null;
        }}
      >
        <div className="epic-list">
          {shown.map((e) => {
            const open = lists.get(e.id)!;
            const done = work.done_counts[e.id] ?? 0;
            const total = open.length + done;
            return (
              <section key={e.id} className={`epic is-${e.status}${e.priority === "high" ? " is-high" : ""}`} aria-labelledby={`epic-${e.id}`}>
                <EpicHead lane={e.id} droppable={!isOpen(e.id)}>
                  <button type="button" className="epic-toggle" aria-expanded={isOpen(e.id)} aria-controls={`epic-body-${e.id}`} onClick={() => toggle(e.id)}>
                    <ChevronIcon size={18} className="epic-chevron" />
                    <h2 id={`epic-${e.id}`} className="epic-title">{e.title}</h2>
                  </button>
                  <span className="epic-progress" aria-label={`${done} of ${total} done`}>
                    <span>{done}/{total}</span>
                    <span className="epic-track" aria-hidden><span className="epic-fill" style={{ transform: `scaleX(${total ? done / total : 0})` }} /></span>
                  </span>
                  <select className={`epic-pick epic-priority is-${e.priority ?? "none"}`} aria-label={`Priority of ${e.title}`} value={e.priority ?? ""} disabled={off}
                    onChange={(ev) => void actions.updateEpic(e.id, { priority: (ev.target.value || null) as Epic["priority"] }, `${e.title}: ${ev.target.value ? PRIORITY_LABEL[ev.target.value as keyof typeof PRIORITY_LABEL].toLowerCase() : "no"} priority`)}>
                    <option value="">No priority</option>
                    <option value="high">High</option>
                    <option value="med">Medium</option>
                    <option value="low">Low</option>
                  </select>
                  <select className={`epic-pick epic-status is-${e.status}`} aria-label={`Status of ${e.title}`} value={e.status} disabled={off}
                    onChange={(ev) => void actions.updateEpic(e.id, { status: ev.target.value as Epic["status"] }, `${e.title}: ${EPIC_STATUS_LABEL[ev.target.value as Epic["status"]].toLowerCase()}`)}>
                    {EPIC_STATUSES.map((s) => <option key={s} value={s}>{EPIC_STATUS_LABEL[s]}</option>)}
                  </select>
                  <button type="button" className="epic-edit" onClick={() => setSheet(e.id)}>Edit</button>
                </EpicHead>
                {isOpen(e.id) && (
                  <div id={`epic-body-${e.id}`} className="epic-body">
                    {e.description && <p className="epic-desc">{e.description}</p>}
                    <LaneList id={e.id} ids={open.map((t) => t.id)} className="lane strips" label={`Tasks in ${e.title}`}>
                      {open.map((t) => strip(t, e.id))}
                    </LaneList>
                    <LaneAdd today={work.today} label={`Add a task to ${e.title}`} disabled={off} onAdd={actions.add} extra={{ epic_id: e.id }} />
                  </div>
                )}
              </section>
            );
          })}
          {!shown.length && <p className="epic-empty">No epics yet.</p>}
          <section className="epic is-none" aria-labelledby="epic-none">
            <EpicHead lane={NONE} droppable={!isOpen(NONE)}>
              <button type="button" className="epic-toggle" aria-expanded={isOpen(NONE)} aria-controls="epic-body-none" onClick={() => toggle(NONE)}>
                <ChevronIcon size={18} className="epic-chevron" />
                <h2 id="epic-none" className="epic-title">No epic</h2>
              </button>
              <span className="count-chip">{lists.get(NONE)!.length}</span>
            </EpicHead>
            {isOpen(NONE) && (
              <div id="epic-body-none" className="epic-body">
                <LaneList id={NONE} ids={lists.get(NONE)!.map((t) => t.id)} className="lane strips" label="Tasks with no epic">
                  {lists.get(NONE)!.map((t) => strip(t, NONE))}
                </LaneList>
              </div>
            )}
          </section>
        </div>
      </LaneDnd>
      {sheet && (
        <EpicSheet key={sheet} epic={editEpic} offline={off}
          onSave={(f) => void (editEpic ? actions.updateEpic(editEpic.id, f) : actions.createEpic(f))}
          onDelete={editEpic ? () => actions.removeEpic(editEpic.id) : undefined}
          onClose={() => setSheet(null)} />
      )}
      {editTask && (
        <EditSheet key={editTask.id} task={editTask} epics={work.epics} offline={off}
          onSave={(id, patch) => void actions.save(id, patch)} onDelete={actions.remove} onClose={() => setEditing(null)} />
      )}
      <Toast toast={actions.toast} onDismiss={actions.dismiss} />
    </main>
  );
}

// An epic's header row. Closed, it takes drops itself (its list isn't there to).
function EpicHead({ lane, droppable, children }: { lane: string; droppable: boolean; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: lane, data: { type: "lane" }, disabled: !droppable });
  return <header ref={droppable ? setNodeRef : undefined} className={`epic-head${isOver ? " is-over" : ""}`}>{children}</header>;
}

type StripProps = {
  task: FullTask; lane: string; epic?: Epic; today: string; disabled?: boolean;
  onOpen: (id: string) => void; onUnfile?: () => void;
};

// A task in an epic: drag from anywhere (or the grip, by keyboard), the title opens it, the cross unfiles it.
function EpicStrip({ task, lane, epic, today, disabled, onOpen, onUnfile }: StripProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id, data: { type: "task", lane }, disabled,
  });
  return (
    <li ref={setNodeRef} className={`slip slip-strip${isDragging ? " is-lifted" : ""}`} data-slip={task.id}
      style={{ transform: CSS.Translate.toString(transform), transition }} {...listeners}>
      <button type="button" ref={setActivatorNodeRef} className="strip-grip" {...attributes} aria-roledescription="task" aria-label={`Move ${task.title}`}>
        <GripIcon size={12} />
      </button>
      <button type="button" className="strip-open" onClick={() => justDropped() || onOpen(task.id)}>
        <SlipPrint task={task} epic={epic} today={today} variant="strip" showStatus />
      </button>
      {onUnfile && (
        <button type="button" className="strip-x" disabled={disabled} aria-label={`Take ${task.title} out of ${epic?.title ?? "its epic"}`} onClick={onUnfile}>
          <CloseIcon size={14} />
        </button>
      )}
    </li>
  );
}
