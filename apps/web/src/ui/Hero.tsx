import "../styles/layout.css";
import "./pass.css";
import { DayPlan } from "./DayPlan";
import { TodoPanel } from "./TodoPanel";
import { TopBar } from "./TopBar";
import type { HeroData } from "./types";

// The first viewport of The Pass: top bar, Day plan (left third), To do rails (right two thirds).
export function Hero({ data }: { data: HeroData }) {
  const { date, headline, done, total, presets, activePreset, hours, now, blocks, ...todo } = data;
  return (
    <div className="pass">
      <TopBar date={date} headline={headline} done={done} total={total} presets={presets} activePreset={activePreset} />
      <main className="pass-main">
        <DayPlan hours={hours} now={now} blocks={blocks} />
        <TodoPanel {...todo} />
      </main>
    </div>
  );
}
