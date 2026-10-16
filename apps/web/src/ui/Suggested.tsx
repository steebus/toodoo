import { AnimatePresence, animate, m, useDragControls, useMotionValue, useTransform, type PanInfo } from "motion/react";
import type { OptimisticLocalStore } from "convex/browser";
import { useMutation, useQuery } from "convex/react";
import { useCallback, useMemo, useRef, useState, type CSSProperties, type FormEvent, type PointerEvent, type Ref } from "react";
import { api } from "@convex/_generated/api";
import { epicMap } from "@shared/epics.ts";
import { words } from "@shared/inbox.ts";
import { formatDuration } from "@shared/planning.ts";
import type { FullTask } from "@shared/snapshot.ts";
import type { ToastData } from "../lib/useActions";
import { buzz, SUGGEST_SWIPE, suggestEnd } from "../lib/swipe";
import { compactDate } from "./format";
import { CheckIcon, CloseIcon, OpenIcon } from "./icons";
import { epicStyle } from "./Slip";
import { reducedMotion, SNAPPY } from "./motion";
import { TaskView } from "./TaskView";
import { JiraState } from "./JiraLink";
import { go } from "../lib/useRoute";
import { Toast } from "./Toast";

type Data = NonNullable<ReturnType<typeof useQuery<typeof api.inbox.list>>>;
type Item = Data["items"][number];
type Exit = "accept" | "reject" | "combine";
// How a card leaves: the three calls, or the two a swipe makes (it carries on in the direction it was pulled).
type Leave = Exit | "swipe-accept" | "swipe-reject";

// Accepted goes up onto the list, rejected slides off aside, combined drops into the task below it; swiped, it goes on the way it was pulled.
const CARD = {
  in: { opacity: 0, y: 18, scale: 0.98 },
  at: { opacity: 1, y: 0, x: 0, scale: 1, rotate: 0 },
  out: (how: Leave) =>
    how === "swipe-accept" ? { opacity: 0, x: 260, rotate: 3 }
    : how === "swipe-reject" ? { opacity: 0, x: -260, rotate: -3 }
    : how === "reject" ? { opacity: 0, x: 160, rotate: 4 } : how === "combine" ? { opacity: 0, y: 30, scale: 0.9 } : { opacity: 0, y: -50, rotate: -2 },
};

// The task fields the Edit sheet can change, handed to Accept.
const EDITS = ["title", "due", "time", "priority", "estimate_mins", "tags", "epic_id", "description", "note", "link", "status", "checklist"] as const;
const draftOf = (x: Item): FullTask => ({
  id: x.id, title: x.title, due: x.due, time: x.time, priority: x.priority, estimate_mins: x.estimate_mins, done: false, done_on: null,
  sort_order: 0, epic_id: x.epic_id, status: x.status ?? "todo", tags: x.tags, source: x.source, external_id: x.external_id, link: x.link,
  note: x.note, description: x.description, checklist: x.checklist,
});

const failure = (e: unknown, what: string) => {
  const msg = (e as { data?: { message?: string } })?.data?.message;
  return msg ? `${what}: ${msg}` : what;
};

const kicker = (x: Item) =>
  x.source === "jira" ? `JIRA  ${(x.external_id ?? "").replace(/^jira:/, "")}` : x.source === "you" ? "SUGGESTED" : x.source.toUpperCase();

// The piles: one per source that proposes. The known ones always show, in this order, so Jira can be linked from
// its own pile; a new source gets a pile of its own the first time it proposes anything.
const KNOWN: [string, string][] = [["jira", "Jira"], ["agent", "Claude"]];
const ALL = "all";
const pileName = (origin: string) => KNOWN.find(([k]) => k === origin)?.[1] ?? origin.charAt(0).toUpperCase() + origin.slice(1);

type Sort = "newest" | "oldest" | "priority" | "due" | "project";
const SORTS: [Sort, string][] = [["newest", "Newest"], ["oldest", "Oldest"], ["priority", "Priority"], ["due", "Due"], ["project", "Project"]];
type View = { pile: string; sort: Sort };
const VIEW_KEY = "toodoo.suggestedView";
const FRESH: View = { pile: ALL, sort: "newest" };
function loadView(): View {
  try {
    const v = { ...FRESH, ...(JSON.parse(localStorage.getItem(VIEW_KEY) ?? "null") as Partial<View> | null) };
    return SORTS.some(([k]) => k === v.sort) ? v : FRESH;
  } catch {
    return FRESH;
  }
}

// When the source made it (a Jira issue's created date), else when it was proposed.
const raised = (x: Item) => x.raised_at ?? x.created_at;
const RANK = { high: 0, med: 1, low: 2 } as const;
const rank = (x: Item) => (x.priority ? RANK[x.priority] : 3);
const blankLast = (a: string | null | undefined, b: string | null | undefined) => (a && b ? a.localeCompare(b) : a ? -1 : b ? 1 : 0);
const sorter = (sort: Sort, project: (x: Item) => string | null) => (a: Item, b: Item): number => {
  const newest = raised(b) - raised(a);
  if (sort === "oldest") return -newest;
  if (sort === "priority") return rank(a) - rank(b) || newest;
  if (sort === "due") return blankLast(a.due, b.due) || rank(a) - rank(b) || newest;
  if (sort === "project") return blankLast(project(a), project(b)) || rank(a) - rank(b) || newest;
  return newest;
};

const DAY_MS = 86_400_000;
export const since = (t: number, now = Date.now()) => {
  const d = Math.floor((now - t) / DAY_MS);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : d < 45 ? `${d}d ago` : d < 365 ? `${Math.round(d / 30)}mo ago` : `${Math.round(d / 365)}y ago`;
};

// Suggested, the triage area: what Claude and the Jira link think Steve should take on, in a pile per source,
// sorted by when it was raised, priority, due date or project. Each waits for a call: Accept (onto the
// list as it is), Edit (open its ticket, change it, then accept), Combine (into a task he already has, filling its gaps), or
// Reject (gone, and never proposed again). On a phone the cards swipe: right accepts, left rejects.
export function Suggested({ offline = false }: { offline?: boolean }) {
  const data = useQuery(api.inbox.list, {});
  const [toast, setToast] = useState<ToastData | null>(null);
  const seq = useRef(0);
  const show = useCallback((t: Omit<ToastData, "id">) => setToast({ ...t, id: ++seq.current }), []);
  const dismiss = useCallback(() => setToast(null), []);
  const [how, setHow] = useState<Leave>("accept");
  const [editing, setEditing] = useState<FullTask | null>(null); // a suggestion opened on its ticket, its changes held until Accept

  // Each settles at once on screen: the card leaves and the count drops before the server answers.
  const settle = (s: OptimisticLocalStore, id: string) => {
    const cur = s.getQuery(api.inbox.list, {});
    if (cur) s.setQuery(api.inbox.list, {}, { ...cur, items: cur.items.filter((x) => x.id !== id) });
    const n = s.getQuery(api.inbox.count, {});
    if (typeof n === "number") s.setQuery(api.inbox.count, {}, Math.max(0, n - 1));
  };
  const accept = useMutation(api.inbox.acceptOne).withOptimisticUpdate((s, a) => settle(s, a.id));
  const reject = useMutation(api.inbox.rejectOne).withOptimisticUpdate((s, a) => settle(s, a.id));
  const combine = useMutation(api.inbox.combineOne).withOptimisticUpdate((s, a) => settle(s, a.id));
  const undo = useMutation(api.inbox.undoOne);

  const act = (x: Item, kind: Exit, task?: { id: string; title: string }, o: { swiped?: boolean; edits?: Record<string, unknown> } = {}) => {
    if (offline) return;
    setHow(o.swiped && kind !== "combine" ? `swipe-${kind}` : kind);
    const back = () => void undo({ id: x.id }).catch((e) => show({ kind: "error", message: failure(e, "Couldn't undo") }));
    const done = kind === "accept" ? `Added: ${x.title}` : kind === "reject" ? `Rejected: ${x.title}` : `Combined into: ${task!.title}`;
    const p = kind === "accept" ? accept({ id: x.id, ...(o.edits ? { edits: o.edits } : {}) }) : kind === "reject" ? reject({ id: x.id }) : combine({ id: x.id, task_id: task!.id });
    p.then(() => show({ kind: "undo", message: done, undo: back }))
      .catch((e) => show({ kind: "error", message: failure(e, "Couldn't do that") }));
  };

  const epics = useMemo(() => epicMap(data?.epics ?? []), [data?.epics]);
  const tagPool = useMemo(() => [...new Set([...(data?.items ?? []).flatMap((x) => x.tags)])].sort(), [data?.items]);
  const [view, setViewState] = useState(loadView);
  const setView = (p: Partial<View>) => {
    const next = { ...view, ...p };
    setViewState(next);
    try { localStorage.setItem(VIEW_KEY, JSON.stringify(next)); } catch { /* holds for this visit */ }
  };
  const piles = useMemo(() => {
    const items = data?.items ?? [];
    const origins = [...KNOWN.map(([k]) => k), ...new Set(items.map((x) => x.origin).filter((o) => !KNOWN.some(([k]) => k === o)))];
    return [
      { id: ALL, name: "All", n: items.length },
      ...origins.map((o) => ({ id: o, name: pileName(o), n: items.filter((x) => x.origin === o).length })),
    ];
  }, [data?.items]);
  const pile = piles.some((p) => p.id === view.pile) ? view.pile : ALL;
  const shown = useMemo(() => {
    const project = (x: Item) => x.project ?? (x.epic_id ? epics.get(x.epic_id)?.title : undefined) ?? null;
    return (data?.items ?? []).filter((x) => pile === ALL || x.origin === pile).sort(sorter(view.sort, project));
  }, [data?.items, pile, view.sort, epics]);

  return (
    <main className="room-main suggested">
      <h1 className="sr-only">Suggested</h1>
      <div className="sug-bar">
        <div className="sug-piles" role="group" aria-label="Sources">
          {piles.map((p) => (
            <button key={p.id} type="button" className="sug-pile" aria-pressed={pile === p.id} onClick={() => setView({ pile: p.id })}>
              {p.name}<span className="sug-pile-n">{p.n}</span>
            </button>
          ))}
        </div>
        <select className="sug-sort" aria-label="Sort" value={view.sort} onChange={(e) => setView({ sort: e.target.value as Sort })}>
          {SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </div>
      {pile === "jira" && <JiraLine />}
      {!data ? (
        <div className="sug-list" aria-busy>
          {[0, 1].map((i) => <div key={i} className="tidy-card sug-card"><span className="skel skel-line" style={{ width: "30%" }} /><span className="skel skel-line" style={{ width: "80%", height: 26 }} /></div>)}
        </div>
      ) : (
        <ol key={pile} className="sug-list" aria-label="Suggestions">
          <AnimatePresence mode="popLayout" custom={how} initial={false}>
            {shown.map((x) => (
              <SugItem key={x.id} id={x.id} how={how} style={epicStyle(x.epic_id ? epics.get(x.epic_id) : undefined)} offline={offline}
                onSwipe={(kind) => act(x, kind, undefined, { swiped: true })}>
                <Card x={x} data={data} epic={x.epic_id ? epics.get(x.epic_id)?.title : undefined} offline={offline}
                  onAccept={() => act(x, "accept")} onReject={() => act(x, "reject")} onCombine={(t) => act(x, "combine", t)}
                  onEdit={() => setEditing(draftOf(x))} />
              </SugItem>
            ))}
          </AnimatePresence>
          {shown.length === 0 && (
            <m.li key="clear" className="tidy-clear" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
              <p className="tidy-clear-word">{pile === ALL ? "Nothing waiting" : `Nothing waiting from ${pileName(pile)}`}</p>
            </m.li>
          )}
        </ol>
      )}
      <Toast toast={toast} onDismiss={dismiss} />
      {data && editing && (
        <TaskView key={editing.id} task={editing} today={data.today} offline={offline} epics={data.epics} tagPool={tagPool}
          epic={editing.epic_id ? epics.get(editing.epic_id) : undefined} createLabel="Accept"
          onClose={() => setEditing(null)}
          onSave={(patch) => { setEditing((d) => d && { ...d, ...patch }); return Promise.resolve(true); }}
          onCreate={async () => {
            const item = data.items.find((i) => i.id === editing.id);
            if (!item) return false;
            act(item, "accept", undefined, { edits: Object.fromEntries(EDITS.map((k) => [k, editing[k]])) });
            return true;
          }} />
      )}
    </main>
  );
}

// One suggestion's card. On a touch screen it swipes: right accepts, left rejects, and short of that it springs back,
// tinted and labelled as it goes. The drag starts anywhere but on a control, so the buttons, links and fields keep working.
function SugItem({ how, style, offline, onSwipe, children, ref }: {
  id: string; how: Leave; style?: CSSProperties; offline: boolean; onSwipe: (kind: "accept" | "reject") => void;
  children: React.ReactNode; ref?: Ref<HTMLLIElement>;
}) {
  const dx = useMotionValue(0);
  const controls = useDragControls();
  const moved = useRef(0);
  const armed = useRef<"accept" | "reject" | null>(null);
  const yes = useTransform(dx, [0, SUGGEST_SWIPE.commit], [0, 1]);
  const no = useTransform(dx, [-SUGGEST_SWIPE.commit, 0], [1, 0]);
  const start = (e: PointerEvent<HTMLLIElement>) => {
    if (offline || (e.target as Element).closest("a, button, input, select, textarea")) return;
    controls.start(e);
  };
  const end = (_: unknown, info: PanInfo) => {
    moved.current = Date.now();
    const r = suggestEnd(dx.get(), info.velocity.x);
    armed.current = null;
    if (r) { buzz(12); onSwipe(r); } else animate(dx, 0, reducedMotion() ? { duration: 0 } : SNAPPY);
  };
  return (
    <m.li ref={ref} layout className="tidy-card sug-card" style={{ ...style, x: dx }}
      custom={how} variants={CARD} initial="in" animate="at" exit="out" transition={{ type: "spring", stiffness: 420, damping: 36 }}
      drag={offline ? false : "x"} dragControls={controls} dragListener={false} dragDirectionLock dragMomentum={false}
      onPointerDown={start}
      onDrag={() => {
        const r = suggestEnd(dx.get(), 0);
        if (r !== armed.current) { armed.current = r; if (r) buzz(6); }
      }}
      onDragEnd={end}
      onClickCapture={(e) => { if (Date.now() - moved.current < 250) { e.preventDefault(); e.stopPropagation(); } }}>
      <m.span className="sug-swipe is-accept" style={{ opacity: yes }} aria-hidden><CheckIcon size={20} /> Accept</m.span>
      <m.span className="sug-swipe is-reject" style={{ opacity: no }} aria-hidden>Reject <CloseIcon size={18} /></m.span>
      {children}
    </m.li>
  );
}

function Card({ x, data, epic, offline, onAccept, onReject, onCombine, onEdit }: {
  x: Item; data: Data; epic?: string; offline: boolean;
  onAccept: () => void; onReject: () => void; onCombine: (t: { id: string; title: string }) => void; onEdit: () => void;
}) {
  const [picking, setPicking] = useState(false);
  const [more, setMore] = useState(false);
  const today = data.today;
  return (
    <article aria-label={x.title}>
      <p className="tidy-kicker">
        <span>{kicker(x)}</span>
        <span>{x.origin === "jira" ? "FROM JIRA" : "FROM CLAUDE"}</span>
      </p>
      <h2 className="tidy-title sug-title">{x.title}</h2>
      <p className="tidy-meta">
        {epic && <span className="tidy-epic"><span className="stats-dot" aria-hidden />{epic}</span>}
        {x.priority && <span className={x.priority === "high" ? "is-high" : undefined}>{x.priority === "med" ? "medium" : x.priority}</span>}
        {x.status && x.status !== "todo" && <span>{x.status}</span>}
        {x.due && <span className={x.due < today ? "is-high" : undefined}>due {compactDate(x.due)}</span>}
        {x.time && <span>at {x.time}</span>}
        {x.estimate_mins && <span>~{formatDuration(x.estimate_mins)}</span>}
        {x.checklist.length > 0 && <span>{x.checklist.length} {x.checklist.length === 1 ? "step" : "steps"}</span>}
        {x.tags.map((t) => <span key={t}>#{t}</span>)}
        {x.note && <span>{x.note}</span>}
        <span title={new Date(raised(x)).toLocaleString()}>{x.raised_at ? "raised" : "suggested"} {since(raised(x))}</span>
      </p>
      {x.description && (
        <p className={`tidy-desc sug-desc${more ? " is-open" : ""}`} onClick={() => setMore((o) => !o)} title={more ? undefined : "Show all"}>
          {x.description}
        </p>
      )}
      {x.link && (
        <a className="sug-link" href={x.link} target="_blank" rel="noreferrer">
          <OpenIcon size={13} /> {x.source === "jira" ? "Open in Jira" : "Open"}
        </a>
      )}
      {x.alike.length > 0 && !picking && (
        <p className="sug-alike">
          <span className="sug-alike-label">Looks like</span>
          {x.alike.map((a) => (
            <button key={a.id} type="button" className="sug-alike-task" disabled={offline} title={`Combine into “${a.title}”`}
              onClick={() => onCombine(a)}>
              {a.title}
            </button>
          ))}
        </p>
      )}
      {picking ? (
        <Picker x={x} tasks={data.tasks} onPick={onCombine} onClose={() => setPicking(false)} />
      ) : (
        <div className="tidy-keys">
          <button type="button" className="tidy-key is-accept" disabled={offline} onClick={onAccept}>Accept</button>
          <button type="button" className="tidy-key" disabled={offline || data.tasks.length === 0} onClick={() => setPicking(true)}>Combine…</button>
          <button type="button" className="tidy-key" disabled={offline} onClick={onEdit}>Edit</button>
          <button type="button" className="tidy-key is-delete" disabled={offline} onClick={onReject}>Reject</button>
        </div>
      )}
    </article>
  );
}

// Which task to combine into: the lookalikes first, then a search over every open task.
function Picker({ x, tasks, onPick, onClose }: {
  x: Item; tasks: Data["tasks"]; onPick: (t: { id: string; title: string }) => void; onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const want = words(q);
    const hits = want.size ? tasks.filter((t) => { const w = words(t.title); return [...want].every((x) => [...w].some((y) => y.startsWith(x))); }) : [];
    const first = x.alike.map((a) => tasks.find((t) => t.id === a.id)).filter((t): t is Data["tasks"][number] => !!t);
    return (q.trim() ? hits : first.length ? first : tasks).slice(0, 8);
  }, [q, tasks, x.alike]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (shown[0]) onPick(shown[0]);
  };
  return (
    <form className="tidy-field sug-pick" onSubmit={submit} onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <span className="tidy-input">
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Combine into…" aria-label="Find a task to combine into"
          autoComplete="off" spellCheck={false} />
      </span>
      <ul className="sug-pick-list" aria-label="Tasks">
        {shown.map((t) => (
          <li key={t.id}>
            <button type="button" className="sug-pick-task" onClick={() => onPick(t)}>
              {t.title}{t.due && <span className="sug-pick-due">{compactDate(t.due)}</span>}
            </button>
          </li>
        ))}
        {q.trim() && !shown.length && <li className="sug-pick-none">No open task matches</li>}
      </ul>
      <div className="tidy-keys"><button type="button" className="tidy-key is-skip" onClick={onClose}>Cancel</button></div>
    </form>
  );
}

// Jira's pile: how the link is doing, and the way to Settings, where it is set up.
function JiraLine() {
  return (
    <p className="sug-jira">
      <JiraState />
      <button type="button" className="room-button is-quiet" onClick={() => go("settings")}>Jira settings</button>
    </p>
  );
}
