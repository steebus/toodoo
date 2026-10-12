import { useEffect, useMemo, useState } from "react";
import { NO_TAG } from "@shared/board.ts";
import "../styles/layout.css";
import "./pass.css";
import type { Actions } from "../lib/useActions";
import { useStoredView } from "../lib/useStoredView";
import { buildPass } from "./build";
import { DayPlan } from "./DayPlan";
import { EditSheet, type Draft } from "./EditSheet";
import { Toast } from "./Toast";
import { TodoPanel } from "./TodoPanel";
import { TopBar } from "./TopBar";
import type { BoardData, Legend } from "./types";

const PRESETS = ["Capture", "Plan", "Focus"];

type Props = { board: BoardData; legend?: Legend; quickAdd?: string; onSignOut?: () => void; actions?: Actions };

// The first viewport of The Pass: top bar, Day plan (left third), To do rails (right two thirds).
export function Hero({ board, legend, quickAdd, onSignOut, actions }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const editTask = editing ? board.tasks.find((t) => t.id === editing) : undefined;
  const [stored, setView] = useStoredView();
  // A remembered tag that no task carries any more would hide everything: fall back to All and remember that.
  const stale = !!stored.tag && stored.tag !== NO_TAG && !board.tasks.some((t) => t.tags.includes(stored.tag));
  const view = useMemo(() => (stale ? { ...stored, tag: "" } : stored), [stale, stored]);
  useEffect(() => {
    if (stale) setView(view);
  }, [stale, view, setView]);
  const model = useMemo(() => buildPass(board, view), [board, view]);
  return (
    <div className="pass">
      <TopBar
        date={model.dateLabel}
        headline={model.headline}
        done={model.done}
        total={model.total}
        presets={PRESETS}
        activePreset="Plan"
      />
      <main className="pass-main">
        <DayPlan plan={model.plan} />
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
          onOpen={actions && ((id) => {
            setDraft(null);
            setEditing(id);
          })}
          onTick={actions?.tick}
        />
      </main>
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
