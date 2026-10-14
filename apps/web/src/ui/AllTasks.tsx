import { useDeferredValue, useMemo, useState, type ReactNode } from "react";
import { addDays } from "@shared/planning.ts";
import { epicMap, TASK_STATUS_LABEL, type TaskStatus } from "@shared/epics.ts";
import { NO_EPIC, NO_TAG } from "@shared/board.ts";
import { haystack, matches, type Everything, type StatTask } from "../lib/stats";
import type { WorkActions } from "../lib/useWork";
import { epicStyle, when } from "./Slip";
import { TaskView } from "./TaskView";
import { Toast } from "./Toast";
import "./stats.css";

type Status = "open" | TaskStatus | "done" | "all";
type Sort = "made" | "done" | "due" | "title";
type Prefs = { status: Status; epic: string; priority: string; tag: string; sort: Sort };
const KEY = "toodoo.allTasksView";
const FRESH: Prefs = { status: "all", epic: "", priority: "", tag: "", sort: "made" };
function loadPrefs(): Prefs {
  try {
    return { ...FRESH, ...(JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Prefs> | null) };
  } catch {
    return FRESH;
  }
}
const STATUSES: [Status, string][] = [["all", "Any status"], ["open", "Open"], ["todo", "To do"], ["doing", "Doing"], ["blocked", "Blocked"], ["done", "Done"]];
const PRIORITIES: [string, string][] = [["", "Any priority"], ["high", "High"], ["med", "Medium"], ["low", "Low"], ["none", "None"]];
const SORTS: [Sort, string][] = [["made", "Newest"], ["done", "Recently done"], ["due", "Due"], ["title", "A–Z"]];
const PAGE = 150; // ponytail: rows drawn at once; virtualise if a few hundred at a time ever drags

const SORT: Record<Sort, (a: StatTask, b: StatTask) => number> = {
  made: (a, b) => b.created_on.localeCompare(a.created_on) || b.sort_order - a.sort_order,
  done: (a, b) => (b.done_on ?? "").localeCompare(a.done_on ?? "") || b.created_on.localeCompare(a.created_on),
  due: (a, b) => a.due.localeCompare(b.due),
  title: (a, b) => a.title.localeCompare(b.title),
};

// Every task in the account, one line each, under a live search (title, notes, description, checklist, tags, epic,
// link) and filters: where you go to find that task you did on that one thing. A click opens its ticket.
export function AllTasks({ all, actions }: { all: Everything; actions: WorkActions }) {
  const [prefs, setState] = useState(loadPrefs);
  const set = (p: Partial<Prefs>) => {
    const next = { ...prefs, ...p };
    setState(next);
    setShown(PAGE);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* holds for this visit */ }
  };
  const [q, setQ] = useState("");
  const query = useDeferredValue(q.trim());
  const [shown, setShown] = useState(PAGE);
  const [viewing, setViewing] = useState<string | null>(null);
  const epics = useMemo(() => epicMap(all.epics), [all.epics]);
  const hay = useMemo(() => new Map(all.tasks.map((t) => [t.id, haystack(t, t.epic_id ? epics.get(t.epic_id) : undefined)])), [all.tasks, epics]);
  const tags = useMemo(() => [...new Set(all.tasks.flatMap((t) => t.tags))].sort(), [all.tasks]);

  const list = useMemo(() => all.tasks.filter((t) => {
    const s = prefs.status;
    if (s === "open" ? t.done : s === "done" ? !t.done : s !== "all" && (t.done || (t.status ?? "todo") !== s)) return false;
    if (prefs.epic && (prefs.epic === NO_EPIC ? t.epic_id : t.epic_id !== prefs.epic)) return false;
    if (prefs.priority && (t.priority ?? "none") !== prefs.priority) return false;
    if (prefs.tag && (prefs.tag === NO_TAG ? t.tags.length : !t.tags.includes(prefs.tag))) return false;
    return !query || matches(hay.get(t.id)!, query);
  }).sort(SORT[prefs.sort]), [all.tasks, prefs, query, hay]);

  const viewTask = viewing ? all.tasks.find((t) => t.id === viewing) : undefined;
  const pick = <K extends keyof Prefs>(k: K, label: string, options: [string, string][]) => (
    <select className="at-pick" aria-label={label} value={prefs[k]} onChange={(e) => set({ [k]: e.target.value } as Partial<Prefs>)}
      data-set={prefs[k] !== FRESH[k] || undefined}>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
  const filtered = (Object.keys(FRESH) as (keyof Prefs)[]).some((k) => k !== "sort" && prefs[k] !== FRESH[k]);

  return (
    <main className="room-main alltasks">
      <div className="at-bar">
        <label className="at-search">
          <span className="at-glass" aria-hidden />
          <input type="search" autoFocus placeholder="Find a task" aria-label="Search every task" value={q}
            onChange={(e) => { setQ(e.target.value); setShown(PAGE); }}
            onKeyDown={(e) => { if (e.key === "Escape" && q) { e.preventDefault(); setQ(""); } }} />
          <span className="at-count" aria-live="polite">{list.length}</span>
        </label>
        <div className="at-filters">
          {pick("status", "Status", STATUSES)}
          {pick("epic", "Epic", [["", "Any epic"], ...all.epics.map((e): [string, string] => [e.id, e.title]), [NO_EPIC, "No epic"]])}
          {pick("priority", "Priority", PRIORITIES)}
          {pick("tag", "Tag", [["", "Any tag"], ...tags.map((x): [string, string] => [x, `#${x}`]), [NO_TAG, "Untagged"]])}
          {pick("sort", "Sort", SORTS)}
          {filtered && <button type="button" className="at-clear" onClick={() => set({ ...FRESH, sort: prefs.sort })}>Clear</button>}
        </div>
      </div>

      {list.length === 0 ? <p className="at-none">No tasks{query && <> match “{query}”</>}</p> : (
        <ol className="at-list">
          {list.slice(0, shown).map((t, i) => {
            const e = t.epic_id ? epics.get(t.epic_id) : undefined;
            const w = when(t, all.today);
            const hit = query ? snippet(t, query) : null;
            return (
              <li key={t.id} className={`at-row${t.done ? " is-done" : ""}`} style={{ ...epicStyle(e), ["--i" as string]: Math.min(i, 20) }}>
                <button type="button" className="at-open" onClick={() => setViewing(t.id)}>
                  <span className={`at-state is-${t.done ? "done" : t.status ?? "todo"}`}>{t.done ? "DONE" : TASK_STATUS_LABEL[t.status ?? "todo"].toUpperCase()}</span>
                  <span className="at-main">
                    <span className={`at-title${t.priority === "high" && !t.done ? " is-high" : ""}`}><Marked text={t.title} q={query} /></span>
                    {hit && <span className="at-hit">{hit.field}: <Marked text={hit.text} q={query} /></span>}
                  </span>
                  <span className="at-meta">
                    {e && <span className="at-epic"><span className="stats-dot" aria-hidden />{e.title}</span>}
                    {t.tags.map((x) => <span key={x} className="at-tag">#{x}</span>)}
                    <span className={w.late ? "at-when is-late" : "at-when"}>{w.text}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
      {list.length > shown && <button type="button" className="room-button at-more" onClick={() => setShown((n) => n + PAGE)}>Show {Math.min(PAGE, list.length - shown)} more</button>}

      {viewTask && (
        <TaskView key={viewTask.id} task={viewTask} today={all.today} offline={actions.offline} epics={all.epics} tagPool={tags}
          epic={viewTask.epic_id ? epics.get(viewTask.epic_id) : undefined}
          onClose={() => setViewing(null)}
          onTick={(done) => actions.move(viewTask.id, { done }, `${done ? "Done" : "Reopened"}: ${viewTask.title}`)}
          onTomorrow={() => void actions.save(viewTask.id, { due: addDays(all.today, 1) })}
          onSave={(patch) => actions.save(viewTask.id, patch)}
          onDelete={() => { actions.remove(viewTask.id); setViewing(null); }} />
      )}
      <Toast toast={actions.toast} onDismiss={actions.dismiss} />
    </main>
  );
}

// Where the search hit, when it wasn't the title: that field, cut down to the words around the first match.
function snippet(t: StatTask, q: string) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.every((w) => t.title.toLowerCase().includes(w))) return null;
  const fields: [string, string | null | undefined][] = [
    ["Note", t.note], ["Description", t.description], ["Checklist", t.checklist?.map((c) => c.text).join(" · ")], ["Link", t.link],
  ];
  for (const [field, text] of fields) {
    if (!text) continue;
    const at = words.map((w) => text.toLowerCase().indexOf(w)).filter((i) => i >= 0).sort((a, b) => a - b)[0];
    if (at === undefined) continue;
    const from = Math.max(0, at - 40);
    return { field, text: `${from ? "…" : ""}${text.slice(from, at + 80).replace(/\s+/g, " ")}${at + 80 < text.length ? "…" : ""}` };
  }
  return null;
}

// The text with each search word picked out in highlighter.
function Marked({ text, q }: { text: string; q: string }): ReactNode {
  const words = q.split(/\s+/).filter(Boolean).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!words.length) return text;
  return text.split(new RegExp(`(${words.join("|")})`, "gi")).map((part, i) => (i % 2 ? <mark key={i}>{part}</mark> : part));
}
