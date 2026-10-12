import { useEffect, useMemo, useState } from "react";
import { addDays } from "@shared/planning.ts";
import { NO_TAG } from "@shared/board.ts";
import "../styles/layout.css";
import "./pass.css";
import type { Actions } from "../lib/useActions";
import { actionFor } from "../lib/shortcuts";
import { useStoredView } from "../lib/useStoredView";
import { buildPass } from "./build";
import { DndProvider } from "./DndProvider";
import { DayPlan, type DayNavProps } from "./DayPlan";
import { EditSheet, type Draft } from "./EditSheet";
import { HelpSheet } from "./HelpSheet";
import { PLAN_SPLIT, PRESET_SPLIT, Panes, useSplit } from "./Panes";
import { Toast } from "./Toast";
import { TodoPanel } from "./TodoPanel";
import { TopBar } from "./TopBar";
import type { BoardData, Legend } from "./types";

const PRESETS = ["Capture", "Plan", "Focus"];

type Props = {
  board: BoardData; legend?: Legend; quickAdd?: string; onSignOut?: () => void; actions?: Actions; nav?: DayNavProps;
};

// The first viewport of The Pass: top bar, Day plan (left third), To do rails (right two thirds).
export function Hero({ board, legend, quickAdd, onSignOut, actions, nav }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const editTask = editing ? board.tasks.find((t) => t.id === editing) : undefined;
  const [help, setHelp] = useState(false);
  const split = useSplit();
  const setSplit = split[1];
  const [stored, setView] = useStoredView();
  // A remembered tag that no task carries any more would hide everything: fall back to All and remember that.
  const stale = !!stored.tag && stored.tag !== NO_TAG && !board.tasks.some((t) => t.tags.includes(stored.tag));
  const view = useMemo(() => (stale ? { ...stored, tag: "" } : stored), [stale, stored]);
  useEffect(() => {
    if (stale) setView(view);
  }, [stale, view, setView]);
  const model = useMemo(() => buildPass(board, view), [board, view]);
  // Shortcuts act on the focused docket (j/k move that focus); x and p are handled by the docket itself.
  const onDate = nav?.onDate;
  const navDate = nav?.date;
  const today = board.today;
  const openTask = actions && ((id: string) => {
    setDraft(null);
    setEditing(id);
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const a = actionFor(e);
      if (!a || e.defaultPrevented) return;
      const dockets = [...document.querySelectorAll<HTMLElement>(".pass [data-docket] .dk-open:not(:disabled)")];
      const at = dockets.indexOf(document.activeElement as HTMLElement);
      const id = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>("[data-docket]")?.dataset.docket;
      if (a === "add") document.querySelector<HTMLElement>(".quickadd-input")?.focus();
      else if (a === "down") dockets[at < 0 ? 0 : Math.min(at + 1, dockets.length - 1)]?.focus();
      else if (a === "up") dockets[at < 0 ? dockets.length - 1 : Math.max(at - 1, 0)]?.focus();
      else if (a === "edit") id && openTask?.(id);
      else if (a === "prevDay" || a === "nextDay") navDate && onDate?.(addDays(navDate, a === "nextDay" ? 1 : -1));
      else if (a === "today") onDate?.(today);
      else if (a === "presetCapture") setSplit(PRESET_SPLIT.Capture);
      else if (a === "presetPlan") setSplit(PLAN_SPLIT);
      else if (a === "presetFocus") setSplit(PRESET_SPLIT.Focus);
      else if (a === "help") setHelp(true);
      else return;
      e.preventDefault();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });
  const preset = PRESETS.find((p) => Math.abs(PRESET_SPLIT[p] - split[0]) < 0.5) ?? "";
  return (
    <div className="pass">
      <TopBar
        date={model.dateLabel}
        headline={model.headline}
        done={model.done}
        total={model.total}
        presets={PRESETS}
        activePreset={preset}
        onPreset={(p) => setSplit(PRESET_SPLIT[p])}
      />
      <DndProvider board={board} groups={model.groups} manual={view.sort === "manual"} actions={actions}>
      <Panes split={split}>
        <DayPlan plan={model.plan} board={board} actions={actions} nav={nav} />
        <TodoPanel
          model={model}
          today={board.today}
          nowM={board.nowM}
          view={view}
          onView={setView}
          legend={legend}
          quickAdd={quickAdd}
          onSignOut={onSignOut}
          onAdd={actions?.add}
          onOpen={openTask}
          onTick={actions?.tick}
          onPlan={actions && ((id) => void actions.planTasks([id], board.date))}
          onPlanAll={actions && (() => void actions.planTasks(board.suggestions.map((s) => s.id), board.date))}
          dnd={!!actions}
        />
      </Panes>
      </DndProvider>
      {actions && editTask && (
        <EditSheet key={editTask.id} task={editTask} draft={draft}
          onSave={(id, patch, values) => {
            void actions.save(id, patch).then((ok) => {
              if (ok) return;
              setDraft(values);
              setEditing(id);
            });
          }}
          onDelete={actions.remove} onClose={() => setEditing(null)} />
      )}
      {help && <HelpSheet onClose={() => setHelp(false)} />}
      {actions && <Toast toast={actions.toast} onDismiss={actions.dismiss} />}
    </div>
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
