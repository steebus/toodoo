import { useDroppable } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { nullsLast } from "@shared/board.ts";
import { useMemo, useState, type HTMLAttributes, type ReactNode, type Ref } from "react";
import { byEpicRank, effectivePriority, EPIC_STATUSES, EPIC_STATUS_LABEL, epicMap, nextColour, TASK_STATUS_LABEL, type Epic } from "@shared/epics.ts";
import { addDays, byOrder, formatDuration } from "@shared/planning.ts";
import { checklistProgress, type FullTask } from "@shared/snapshot.ts";
import { orderAt, type Drop, type Lane } from "../lib/lanes";
import type { WorkActions, WorkData } from "../lib/useWork";
import { EpicSheet } from "./EpicSheet";
import { HeaderControls } from "./RoomShell";
import { AlertIcon, BlockedIcon, CalendarIcon, ChevronIcon, ClockIcon, CloseIcon, FlagIcon, GripIcon, OpenIcon, PencilIcon, PlayIcon, PlusIcon } from "./icons";
import { justDropped, LaneDnd, LaneList } from "./LaneDnd";
import { epicStyle, LaneAdd, when } from "./Slip";
import { fitOf, listLine } from "./build";
import { TaskView } from "./TaskView";
import { compactDate } from "./format";
import { SettingsMenu, SettingsPick } from "./ViewMenu";
import { Toast } from "./Toast";

const NONE = "__none"; // the lane of tasks with no epic

const KEY = "toodoo.epicsView";
const SORTS = [["rank", "Status & priority"], ["due", "Next due"], ["work", "Most work left"], ["progress", "Furthest along"], ["name", "A–Z"]] as const;
const SHOWS: [string, string][] = [["open", "Not done"], ["all", "All"], ...EPIC_STATUSES.map((s): [string, string] => [s, EPIC_STATUS_LABEL[s]])];
const PRIORITIES: [string, string][] = [["", "Any"], ["high", "High"], ["med", "Medium"], ["low", "Low"], ["none", "No priority"]];
const LAYOUTS: [string, string][] = [["cards", "Folders"], ["folder", "One folder, tabs"]];
type Sort = (typeof SORTS)[number][0];
type Prefs = { sort: Sort; show: string; priority: string; open: Record<string, boolean>; layout: string; tab: string };
function loadPrefs(): Prefs {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as (Partial<Prefs> & { showDone?: boolean }) | null;
    return {
      sort: SORTS.find(([v]) => v === raw?.sort)?.[0] ?? "rank",
      show: SHOWS.some(([v]) => v === raw?.show) ? raw!.show! : raw?.showDone ? "all" : "open",
      priority: PRIORITIES.some(([v]) => v === raw?.priority) ? raw!.priority! : "",
      open: raw?.open && typeof raw.open === "object" ? raw.open : {},
      layout: LAYOUTS.some(([v]) => v === raw?.layout) ? raw!.layout! : "cards",
      tab: typeof raw?.tab === "string" ? raw.tab : "",
    };
  } catch {
    return { sort: "rank", show: "open", priority: "", open: {}, layout: "cards", tab: "" };
  }
}

// What an epic's open tasks add up to: the work left, how many, the high, stuck and late ones, and the next date.
export function summary(tasks: FullTask[], today: string, epic?: Epic) {
  const dues = tasks.map((t) => t.due).filter((d): d is string => d !== null).sort();
  return {
    mins: tasks.reduce((n, t) => n + (t.estimate_mins ?? 0), 0),
    unsized: tasks.filter((t) => !t.estimate_mins).length,
    high: tasks.filter((t) => effectivePriority(t, epic) === "high").length,
    doing: tasks.filter((t) => t.status === "doing").length,
    blocked: tasks.filter((t) => t.status === "blocked").length,
    late: dues.filter((d) => d < today).length,
    next: dues.find((d) => d >= today) ?? null,
  };
}
// Every epic starts folded (its name, colour, progress and tallies still show); opened ones stay open.
const openByDefault = (_e?: Epic) => false;

export function Epics({ work, actions }: { work: WorkData; actions: WorkActions }) {
  const [prefs, setPrefsState] = useState(loadPrefs);
  const setPrefs = (p: Prefs) => {
    setPrefsState(p);
    try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* holds for this visit */ }
  };
  const [sheet, setSheet] = useState<string | "new" | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const off = actions.offline;

  const epics = useMemo(() => epicMap(work.epics), [work.epics]);
  const byId = useMemo(() => new Map(work.tasks.map((t) => [t.id, t])), [work.tasks]);
  // Each epic lists its open tasks in manual order; tasks in a hidden (done) epic stay where they are.
  const lists = useMemo(() => {
    const m = new Map<string, FullTask[]>([[NONE, []], ...work.epics.map((e) => [e.id, []] as [string, FullTask[]])]);
    for (const t of work.tasks) if (!t.done) m.get(t.epic_id && m.has(t.epic_id) ? t.epic_id : NONE)!.push(t);
    for (const l of m.values()) l.sort(byOrder);
    return m;
  }, [work]);
  const sums = useMemo(() => new Map(work.epics.map((e) => [e.id, summary(lists.get(e.id)!, work.today, e)])), [work, lists]);
  const shown = useMemo(() => {
    const progress = (e: Epic) => { const d = work.done_counts[e.id] ?? 0, n = d + lists.get(e.id)!.length; return n ? d / n : 0; };
    const by: Record<Sort, (a: Epic, b: Epic) => number> = {
      rank: () => 0,
      due: (a, b) => nullsLast(sums.get(a.id)!.next, sums.get(b.id)!.next),
      work: (a, b) => sums.get(b.id)!.mins - sums.get(a.id)!.mins,
      progress: (a, b) => progress(b) - progress(a),
      name: (a, b) => a.title.localeCompare(b.title),
    };
    return work.epics
      .filter((e) => (prefs.show === "all" ? true : prefs.show === "open" ? e.status !== "done" : e.status === prefs.show))
      .filter((e) => !prefs.priority || (e.priority ?? "none") === prefs.priority)
      .sort((a, b) => by[prefs.sort](a, b) || byEpicRank(a, b));
  }, [work, lists, sums, prefs.show, prefs.priority, prefs.sort]);
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
  const viewTask = viewing ? byId.get(viewing) : undefined;
  const strip = (t: FullTask, lane: string) => (
    <EpicTicket key={t.id} task={t} lane={lane} epic={t.epic_id ? epics.get(t.epic_id) : undefined} today={work.today}
      disabled={off} onOpen={setViewing} onUnfile={lane === NONE ? undefined : () => unfile(t)} />
  );

  // The other view: one big folder, a tab along the top for each epic, the chosen one's tasks inside.
  const tabId = prefs.tab === NONE || shown.some((e) => e.id === prefs.tab) ? prefs.tab : shown[0]?.id ?? NONE;
  const cur = tabId === NONE ? undefined : epics.get(tabId);
  const curOpen = lists.get(tabId) ?? [];
  const curDone = work.done_counts[tabId] ?? 0;
  const bigFolder = (
    <section className={`bigfolder${cur?.colour ? " has-epic" : ""}`} style={epicStyle(cur)}>
      <div className="bf-tabs" role="tablist" aria-label="Epics">
        {shown.map((e) => (
          <FolderTab key={e.id} lane={e.id} epic={e} active={tabId === e.id} n={lists.get(e.id)!.length} sum={sums.get(e.id)!}
            today={work.today} onPick={() => setPrefs({ ...prefs, tab: e.id })} />
        ))}
        <FolderTab lane={NONE} active={tabId === NONE} n={lists.get(NONE)!.length} sum={summary(lists.get(NONE)!, work.today)}
          today={work.today} onPick={() => setPrefs({ ...prefs, tab: NONE })} />
      </div>
      <div className={`bf-body${cur?.priority === "high" ? " is-high" : ""}`} role="tabpanel">
        {cur ? (
          <>
            <header className="bf-head">
              <h2 className="epic-title">{cur.title}</h2>
              {cur.status !== "active" && <span className={`epic-state is-${cur.status}`}>{EPIC_STATUS_LABEL[cur.status]}</span>}
              <span className="epic-progress" aria-label={`${curDone} of ${curOpen.length + curDone} done`}>
                <span className="epic-track" aria-hidden><span className="epic-fill" style={{ transform: `scaleX(${curOpen.length + curDone ? curDone / (curOpen.length + curDone) : 0})` }} /></span>
                <span className="epic-count">{curDone}/{curOpen.length + curDone} done</span>
              </span>
              <button type="button" className="epic-edit" aria-label={`Edit ${cur.title}`} title="Edit" onClick={() => setSheet(cur.id)}>
                <PencilIcon size={17} />
              </button>
            </header>
            {cur.description && <p className="epic-desc">{cur.description}</p>}
          </>
        ) : null}
        <LaneList id={tabId} ids={curOpen.map((t) => t.id)} className="lane tickets" grid label={cur ? `Tasks in ${cur.title}` : "Tasks with no epic"}>
          {curOpen.map((t) => strip(t, tabId))}
        </LaneList>
        {cur && <LaneAdd today={work.today} label={`Add a task to ${cur.title}`} disabled={off} onAdd={actions.add} extra={{ epic_id: cur.id }} />}
      </div>
    </section>
  );

  return (
    <main className="room-main epics">
      <h1 className="sr-only">Epics</h1>
      <HeaderControls>
        <SettingsMenu label="Sort and filter">
          <SettingsPick label="Layout" value={prefs.layout} options={LAYOUTS} onChange={(layout) => setPrefs({ ...prefs, layout })} />
          <SettingsPick label="Sort" value={prefs.sort} options={SORTS.map(([v, l]): [string, string] => [v, l])}
            onChange={(sort) => setPrefs({ ...prefs, sort: sort as Sort })} />
          <SettingsPick label="Status" value={prefs.show} options={SHOWS} onChange={(show) => setPrefs({ ...prefs, show })} />
          <SettingsPick label="Priority" value={prefs.priority} options={PRIORITIES} onChange={(priority) => setPrefs({ ...prefs, priority })} />
        </SettingsMenu>
        <button type="button" className="room-button room-add" disabled={off} aria-label="New epic" title="New epic" onClick={() => setSheet("new")}>
          <PlusIcon size={15} /><span className="room-add-text">New epic</span>
        </button>
      </HeaderControls>
      <LaneDnd lanes={lanes} disabled={off} titleOf={(id) => byId.get(id)?.title ?? "task"} laneName={nameOf} onDrop={drop}
        ghost={(id) => {
          const t = byId.get(id);
          return t ? <MiniTicket task={t} epic={t.epic_id ? epics.get(t.epic_id) : undefined} today={work.today} ghost /> : null;
        }}
      >
        {prefs.layout === "folder" ? bigFolder : <div className="epic-list">
          {shown.map((e) => {
            const open = lists.get(e.id)!;
            const done = work.done_counts[e.id] ?? 0;
            const total = open.length + done;
            const sum = sums.get(e.id)!;
            return (
              <section key={e.id} className={`epic is-${e.status}${e.priority === "high" ? " is-high" : ""}${e.colour ? " has-epic" : ""}`}
                style={epicStyle(e)} aria-labelledby={`epic-${e.id}`}>
                <EpicHead lane={e.id} droppable={!isOpen(e.id)}>
                  <button type="button" className="epic-toggle" aria-expanded={isOpen(e.id)} aria-controls={`epic-body-${e.id}`} onClick={() => toggle(e.id)}>
                    <ChevronIcon size={18} className="epic-chevron" />
                    <h2 id={`epic-${e.id}`} className="epic-title">{e.title}</h2>
                  </button>
                  <button type="button" className="epic-edit" aria-label={`Edit ${e.title}`} title="Edit" onClick={() => setSheet(e.id)}>
                    <PencilIcon size={17} />
                  </button>
                  <div className="epic-meta">
                    <span className="epic-progress" aria-label={`${done} of ${total} done`}>
                      <span className="epic-track" aria-hidden><span className="epic-fill" style={{ transform: `scaleX(${total ? done / total : 0})` }} /></span>
                      <span className="epic-count">{done}/{total} done</span>
                      {e.status !== "active" && <span className={`epic-state is-${e.status}`}>{EPIC_STATUS_LABEL[e.status]}</span>}
                    </span>
                    <ul className="epic-stats">
                      <EpicStats n={open.length} sum={sum} today={work.today} />
                    </ul>
                  </div>
                </EpicHead>
                {isOpen(e.id) && (
                  <div id={`epic-body-${e.id}`} className="epic-body">
                    {e.description && <p className="epic-desc">{e.description}</p>}
                    <LaneList id={e.id} ids={open.map((t) => t.id)} className="lane tickets" grid label={`Tasks in ${e.title}`}>
                      {open.map((t) => strip(t, e.id))}
                    </LaneList>
                    <LaneAdd today={work.today} label={`Add a task to ${e.title}`} disabled={off} onAdd={actions.add} extra={{ epic_id: e.id }} />
                  </div>
                )}
              </section>
            );
          })}
          {!shown.length && <p className="epic-empty">{work.epics.length ? "No epics match." : "No epics yet."}</p>}
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
                <LaneList id={NONE} ids={lists.get(NONE)!.map((t) => t.id)} className="lane tickets" grid label="Tasks with no epic">
                  {lists.get(NONE)!.map((t) => strip(t, NONE))}
                </LaneList>
              </div>
            )}
          </section>
        </div>}
      </LaneDnd>
      {sheet && (
        <EpicSheet key={sheet} epic={editEpic} colour={nextColour(work.epics)} offline={off}
          onSave={(f) => void (editEpic ? actions.updateEpic(editEpic.id, f) : actions.createEpic(f))}
          onDelete={editEpic ? () => actions.removeEpic(editEpic.id) : undefined}
          onClose={() => setSheet(null)} />
      )}
      {viewTask && (
        <TaskView key={viewTask.id} task={viewTask} today={work.today} offline={off} epics={work.epics}
          tagPool={[...new Set(work.tasks.flatMap((t) => t.tags))].sort()}
          epic={viewTask.epic_id ? epics.get(viewTask.epic_id) : undefined}
          onClose={() => setViewing(null)}
          onTick={(done) => actions.move(viewTask.id, { done }, `${done ? "Done" : "Reopened"}: ${viewTask.title}`)}
          onPlan={() => actions.plan(viewTask.id, work.today)}
          onTomorrow={() => void actions.save(viewTask.id, { due: addDays(work.today, 1) })}
          onSave={(patch) => actions.save(viewTask.id, patch)}
          onDelete={() => actions.remove(viewTask.id)} />
      )}
      <Toast toast={actions.toast} onDismiss={actions.dismiss} />
    </main>
  );
}

// One of an epic's tallies: an icon and a short count, red where it wants attention.
function Stat({ icon, tone, tag: Tag = "li", children }: { icon: ReactNode; tone?: "red"; tag?: "li" | "span"; children: ReactNode }) {
  return <Tag className={`epic-stat${tone ? ` is-${tone}` : ""}`}>{icon}<span>{children}</span></Tag>;
}

// An epic's tallies, in order: work left, open, doing, high, blocked, overdue, next due. A span each inside a tab, an li on a card.
function EpicStats({ n, sum, today, tag }: { n: number; sum: ReturnType<typeof summary>; today: string; tag?: "li" | "span" }) {
  const Tag = tag ?? "li";
  return (
    <>
      {n > 0 && <Stat tag={tag} icon={<ClockIcon size={15} />}>{sum.mins ? `~${formatDuration(sum.mins)}` : "unsized"}{sum.mins > 0 && sum.unsized > 0 && <span className="epic-sum-soft"> +{sum.unsized}?</span>}</Stat>}
      {n > 0 && <Stat tag={tag} icon={<OpenIcon size={15} />}>{n} open</Stat>}
      {sum.doing > 0 && <Stat tag={tag} icon={<PlayIcon size={15} />}>{sum.doing} doing</Stat>}
      {sum.high > 0 && <Stat tag={tag} icon={<FlagIcon size={15} />} tone="red">{sum.high} high</Stat>}
      {sum.blocked > 0 && <Stat tag={tag} icon={<BlockedIcon size={15} />} tone="red">{sum.blocked} blocked</Stat>}
      {sum.late > 0 && <Stat tag={tag} icon={<AlertIcon size={15} />} tone="red">{sum.late} overdue</Stat>}
      {sum.next && <Stat tag={tag} icon={<CalendarIcon size={15} />}>{sum.next === today ? "today" : compactDate(sum.next)}</Stat>}
      {n === 0 && <Tag className="epic-stat epic-sum-soft">Nothing open</Tag>}
    </>
  );
}

// One epic's tab on the big folder: its name, its tallies under it. A tab takes a dropped task (the open one has its list).
function FolderTab({ lane, epic, active, n, sum, today, onPick }: {
  lane: string; epic?: Epic; active: boolean; n: number; sum: ReturnType<typeof summary>; today: string; onPick: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: lane, data: { type: "lane" }, disabled: active });
  return (
    <button ref={active ? undefined : setNodeRef} type="button" role="tab" aria-selected={active} onClick={onPick} style={epicStyle(epic)}
      className={`bf-tab is-${epic?.status ?? "none"}${epic?.priority === "high" ? " is-high" : ""}${active ? " is-active" : ""}${isOver ? " is-over" : ""}`}>
      <span className="bf-name">{epic?.title ?? "No epic"}</span>
      <span className="bf-stats"><EpicStats n={n} sum={sum} today={today} tag="span" /></span>
    </button>
  );
}

// An epic's header row. Closed, it takes drops itself (its list isn't there to).
function EpicHead({ lane, droppable, children }: { lane: string; droppable: boolean; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: lane, data: { type: "lane" }, disabled: !droppable });
  return <header ref={droppable ? setNodeRef : undefined} className={`epic-head${isOver ? " is-over" : ""}`}>{children}</header>;
}

type TicketProps = {
  task: FullTask; lane: string; epic?: Epic; today: string; disabled?: boolean;
  onOpen?: (id: string) => void; onUnfile?: () => void;
};

// A task in an epic, as its ticket on the Day view is, only smaller: the same paper, print, fit and pen marks.
// Drag it by the paper (or its grip, by keyboard); the title opens it; the cross takes it out of the epic.
function EpicTicket({ task, lane, epic, today, disabled, onOpen, onUnfile }: TicketProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id, data: { type: "task", lane }, disabled,
  });
  return (
    <MiniTicket task={task} epic={epic} today={today} disabled={disabled} onOpen={onOpen} onUnfile={onUnfile} lifted={isDragging}
      li={{ ref: setNodeRef, style: { transform: CSS.Translate.toString(transform), transition }, ...listeners }}
      grip={{ ref: setActivatorNodeRef, ...attributes }} />
  );
}

type MiniProps = Omit<TicketProps, "lane"> & {
  lifted?: boolean; ghost?: boolean;
  li?: HTMLAttributes<HTMLLIElement> & { ref?: Ref<HTMLLIElement> };
  grip?: HTMLAttributes<HTMLButtonElement> & { ref?: Ref<HTMLButtonElement> };
};

export function MiniTicket({ task: t, epic, today, disabled, onOpen, onUnfile, lifted, ghost, li, grip }: MiniProps) {
  const w = when(t, today);
  const high = !t.done && effectivePriority(t, epic) === "high";
  const list = checklistProgress(t.checklist);
  const blocked = !t.done && t.status === "blocked";
  const flags = [high ? "! HIGH" : "", t.status && t.status !== "todo" && !blocked ? TASK_STATUS_LABEL[t.status].toUpperCase() : "",
    t.source !== "you" ? t.source.toUpperCase() : ""].filter(Boolean).join(" · ");
  const Tag = ghost ? "div" : "li";
  return (
    <Tag {...(li as HTMLAttributes<HTMLElement>)} data-slip={ghost ? undefined : t.id}
      className={`docket docket-today mini-ticket fit-${fitOf(t.title)}${high ? " is-high" : ""}${blocked ? " is-blocked" : ""}${lifted ? " is-lifted" : ""}${ghost ? " is-ghost" : ""}`}>
      <div className="dk-paper">
        <article className="dk-print" aria-label={t.title}>
          <p className="dk-head">
            <span className={w.late ? "mt-late" : undefined}>{w.text}</span>
            {blocked && <span className="dk-blocked"><BlockedIcon size={14} />BLOCKED</span>}
            <span className="dk-dur">{t.estimate_mins ? `~${formatDuration(t.estimate_mins)}` : ""}</span>
          </p>
          <h4 className="dk-title">
            <button type="button" className="dk-open" tabIndex={ghost ? -1 : undefined} onClick={() => justDropped() || onOpen?.(t.id)}>
              <span className="dk-title-text">{t.title.toUpperCase()}</span>
            </button>
          </h4>
          {flags && <p className="dk-source">{flags}</p>}
          <p className="dk-dashes" aria-hidden>{"-".repeat(60)}</p>
          {list && (
            <dl className="dk-rows">
              <div className="dk-row"><dt>LIST</dt><dd>{listLine(list)}</dd></div>
            </dl>
          )}
          {!ghost && (
            <button type="button" className="mt-grip" {...grip} aria-roledescription="task" aria-label={`Move ${t.title}`}>
              <GripIcon size={11} />
            </button>
          )}
          {!ghost && onUnfile && (
            <button type="button" className="mt-x" disabled={disabled} aria-label={`Take ${t.title} out of ${epic?.title ?? "its epic"}`} onClick={onUnfile}>
              <CloseIcon size={13} />
            </button>
          )}
        </article>
      </div>
    </Tag>
  );
}
