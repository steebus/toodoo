import { useEffect, useMemo, useRef, useState } from "react";
import { addDays } from "@shared/planning.ts";
import { NO_EPIC, NO_TAG } from "@shared/board.ts";
import "../styles/layout.css";
import "./pass.css";
import { OfflineContext } from "../lib/offline";
import { isOptimistic, type Actions } from "../lib/useActions";
import { actionFor } from "../lib/shortcuts";
import { useNarrow } from "../lib/useNarrow";
import { useStoredView } from "../lib/useStoredView";
import { focusBlock } from "../lib/focus";
import { buildPass } from "./build";
import { DndProvider } from "./DndProvider";
import { DayPlan, type DayNavProps } from "./DayPlan";
import { EditSheet, type Draft } from "./EditSheet";
import { HelpSheet } from "./HelpSheet";
import { AddButton, AddSheet, Tabs, type Tab } from "./Mobile";
import { MotionRoot, useArrivals, useCelebration } from "./motion";
import { COMPACT_AT, PLAN_SPLIT, PRESET_SPLIT, Panes, useSplit } from "./Panes";
import { Toast } from "./Toast";
import { TaskView } from "./TaskView";
import { TodoPanel } from "./TodoPanel";
import { TopBar } from "./TopBar";
import type { BoardData } from "./types";

const PRESETS = ["Plan", "Capture"];

type Props = {
  board: BoardData; quickAdd?: string; onSignOut?: () => void; actions?: Actions; nav?: DayNavProps;
};

// The first viewport of The Pass: top bar, Day plan (left third), To do rails (right two thirds).
export function Hero({ board, quickAdd, onSignOut, actions, nav }: Props) {
  const offline = !!actions?.offline;
  const [editing, setEditing] = useState<string | null>(null);
  const [viewing, setViewing] = useState<string | null>(null); // the task read in its ticket sheet
  const [draft, setDraft] = useState<Draft | null>(null);
  const editTask = editing ? board.tasks.find((t) => t.id === editing) : undefined;
  const [help, setHelp] = useState(false);
  // The phone: two tabs instead of two panes, and the quick add in a sheet (null: closed; else its line).
  const narrow = useNarrow();
  const [tab, setTab] = useState<Tab>("today");
  const [adding, setAdding] = useState<string | null>(null);
  const split = useSplit();
  const setSplit = split[1];
  const [stored, setView] = useStoredView();
  // A remembered tag that no task carries would hide everything: show All for now, but keep the tag
  // (the board may be a passing one, e.g. a day still loading or a kept copy).
  const stale = !!stored.tag && stored.tag !== NO_TAG && !board.tasks.some((t) => t.tags.includes(stored.tag));
  const staleEpic = !!stored.epic && stored.epic !== NO_EPIC && !(board.epics ?? []).some((e) => e.id === stored.epic);
  const view = useMemo(
    () => (stale || staleEpic ? { ...stored, ...(stale ? { tag: "" } : {}), ...(staleEpic ? { epic: "" } : {}) } : stored),
    [stale, staleEpic, stored],
  );
  const model = useMemo(() => buildPass(board, view), [board, view]);
  // Shortcuts act on the focused docket (j/k move that focus); x and p are handled by the docket itself.
  const onDate = nav?.onDate;
  const navDate = nav?.date;
  const today = board.today;
  const viewTask = board.tasks.find((t) => t.id === viewing);
  // Focus: the task in hand (or next) in its ticket, the room dark behind it and a kitchen timer running.
  const [focusing, setFocusing] = useState(false);
  const block = focusBlock(board);
  const focusNow = actions && block ? () => { opener.current = document.activeElement; setFocusing(true); setViewing(block.id); } : undefined;
  const focused = focusing && block && viewing === block.id ? block : null;
  // Clicking a task reads it (the ticket); e, or Edit on the ticket, edits it.
  const opener = useRef<Element | null>(null); // what opened the ticket, for focus when the sheets close
  const showTask = actions && ((id: string) => {
    opener.current = document.activeElement;
    setViewing(id);
  });
  const openTask = actions && ((id: string) => {
    setViewing(null);
    setDraft(null);
    setEditing(id);
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const a = actionFor(e);
      if (!a || e.defaultPrevented) return;
      const dockets = [...document.querySelectorAll<HTMLElement>(".pass [data-docket] .dk-open:not(:disabled)")];
      const at = dockets.indexOf(document.activeElement as HTMLElement);
      const el = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>("[data-docket], .plan-block[data-block]");
      const id = el?.dataset.docket ?? el?.dataset.block;
      if (a === "add") narrow ? actions && !offline && setAdding("") : document.querySelector<HTMLElement>(".quickadd-input")?.focus();
      else if (a === "down") dockets[at < 0 ? 0 : Math.min(at + 1, dockets.length - 1)]?.focus();
      else if (a === "up") dockets[at < 0 ? dockets.length - 1 : Math.max(at - 1, 0)]?.focus();
      else if (a === "edit") id && openTask?.(id);
      else if (a === "prevDay" || a === "nextDay") navDate && onDate?.(addDays(navDate, a === "nextDay" ? 1 : -1));
      else if (a === "today") onDate?.(today);
      else if (a === "presetPlan") setSplit(PRESET_SPLIT.Plan);
      else if (a === "presetCapture") setSplit(PRESET_SPLIT.Capture);
      else if (a === "focus") focusNow?.();
      else if (a === "help") setHelp(true);
      else return;
      e.preventDefault();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });
  const preset = PRESETS.find((p) => Math.abs(PRESET_SPLIT[p] - split[0]) < 0.5) ?? "";
  const compact = narrow || split[0] > COMPACT_AT; // the phone's list is the stub column, hung from rails
  const arrivals = useArrivals(board.tasks.map((t) => t.id), isOptimistic);
  const celebrate = useCelebration({ date: board.date, done: model.done, total: model.total });
  return (
    <MotionRoot>
      <OfflineContext value={offline}>
      <div className="pass" data-offline={offline || undefined} data-tab={narrow ? tab : undefined}>
        <TopBar
          date={model.dateLabel}
          headline={model.headline}
          done={model.done}
          total={model.total}
          presets={PRESETS}
          activePreset={preset}
          onPreset={(p) => setSplit(PRESET_SPLIT[p])}
          onFocus={focusNow}
          celebrate={celebrate}
          offline={offline}
          unsaved={!!actions?.unsaved}
          rooms={!!actions}
        />
        <DndProvider board={board} groups={model.groups} manual={view.sort === "manual"} moves={view.group === "status"} compact={compact} actions={actions}>
        <Panes split={split}>
          <DayPlan plan={model.plan} board={board} actions={actions} nav={nav} tabpanel={narrow}
            nextUp={{
              items: model.nextUp, onOpen: showTask,
              onPlanAll: actions && !offline ? (() => void actions.planTasks(board.suggestions.map((s) => s.id), board.date)) : undefined,
            }} />
          <TodoPanel
            model={model}
            today={board.today}
            nowM={board.nowM}
            view={view}
            onView={setView}
            quickAdd={quickAdd}
            onSignOut={onSignOut}
            onAdd={actions?.add}
            onOpen={showTask}
            onTick={actions?.tick}
            onPlan={actions && !offline ? ((id) => void actions.planTasks([id], board.date)) : undefined}
            dnd={!!actions}
            compact={compact}
            offline={offline}
            arrivals={arrivals}
            swipe={narrow && !!actions}
            tabpanel={narrow}
            onTomorrow={actions && !offline ? ((id) => void actions.save(id, { due: addDays(board.today, 1) })) : undefined}
          />
        </Panes>
        </DndProvider>
        {narrow && (
          <>
            {actions && <AddButton disabled={offline} onClick={() => setAdding("")} />}
            <Tabs tab={tab} onTab={setTab} />
          </>
        )}
        {narrow && actions && adding !== null && (
          <AddSheet today={board.today} nowM={board.nowM} initial={adding} epics={board.epics} onAdd={(t) => {
            setTab("today");
            return actions.add(t);
          }} onClose={() => setAdding(null)} onFailed={setAdding} />
        )}
        {actions && editTask && (
          <EditSheet key={editTask.id} task={editTask} epics={board.epics} returnTo={opener.current} draft={draft} offline={offline}
            onSave={(id, patch, values) => {
              void actions.save(id, patch).then((ok) => {
                if (ok) return;
                setDraft(values);
                setEditing(id);
              });
            }}
            onDelete={actions.remove} onClose={() => setEditing(null)} />
        )}
        {actions && viewTask && (
          <TaskView key={viewTask.id} task={viewTask} today={board.today} offline={offline}
            epic={viewTask.epic_id ? board.epics?.find((e) => e.id === viewTask.epic_id) : undefined}
            progress={viewTask.estimate_mins && board.effort?.[viewTask.id]?.actual
              ? { spent: board.effort[viewTask.id].actual, est: viewTask.estimate_mins } : null}
            focus={focused ? { startM: focused.startM, endM: focused.endM } : undefined}
            onClose={() => { setViewing(null); setFocusing(false); }}
            onTick={(done) => actions.tick(viewTask.id, done)}
            onPlan={() => void actions.planTasks([viewTask.id], board.date)}
            onTomorrow={() => void actions.save(viewTask.id, { due: addDays(board.today, 1) })}
            onEdit={() => openTask?.(viewTask.id)}
            onDelete={() => actions.remove(viewTask.id)}
            onChecklist={(checklist) => void actions.save(viewTask.id, { checklist })} />
        )}
        {help && <HelpSheet onClose={() => setHelp(false)} />}
        {actions && <Toast toast={actions.toast} onDismiss={actions.dismiss} />}
      </div>
      </OfflineContext>
    </MotionRoot>
  );
}

// The frame with no data yet, so the first paint is not blank.
export function HeroShell() {
  return (
    <div className="pass">
      <header className="topbar">
        <p className="r-wordmark wordmark">toodoo</p>
        <div className="r-topbar-rule topbar-rule" aria-hidden />
      </header>
      <main className="pass-main">
        <section className="dayplan" aria-labelledby="dayplan-title">
          <h2 id="dayplan-title" className="r-dayplan-title panel-title">Day plan</h2>
        </section>
        <section className="todo" aria-labelledby="todo-title">
          <h2 id="todo-title" className="r-todo-title panel-title">To do</h2>
        </section>
      </main>
    </div>
  );
}
