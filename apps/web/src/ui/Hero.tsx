import { useMemo } from "react";
import "../styles/layout.css";
import "./pass.css";
import { useStoredView } from "../lib/useStoredView";
import { buildPass } from "./build";
import { DayPlan } from "./DayPlan";
import { TodoPanel } from "./TodoPanel";
import { TopBar } from "./TopBar";
import type { BoardData, Legend } from "./types";

const PRESETS = ["Capture", "Plan", "Focus"];

type Props = { board: BoardData; legend?: Legend; quickAdd?: string; onSignOut?: () => void };

// The first viewport of The Pass: top bar, Day plan (left third), To do rails (right two thirds).
export function Hero({ board, legend, quickAdd, onSignOut }: Props) {
  const [view, setView] = useStoredView();
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
        />
      </main>
    </div>
  );
}
