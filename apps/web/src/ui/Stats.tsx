import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { addDays, formatDuration } from "@shared/planning.ts";
import { epicMap, TASK_STATUS_LABEL, TASK_STATUSES } from "@shared/epics.ts";
import { NO_EPIC } from "@shared/board.ts";
import {
  budget, burndown, countBy, dayRange, leadDays, median, plannedByDay, streak, weekOf, type Everything,
} from "../lib/stats";
import { HeaderControls } from "./RoomShell";
import { SettingsMenu, SettingsPick } from "./ViewMenu";
import { shortDate } from "./format";
import "./stats.css";

type Prefs = { days: string; epic: string };
const KEY = "toodoo.statsView";
const RANGES: [string, string][] = [["14", "2 weeks"], ["30", "30 days"], ["90", "90 days"], ["365", "A year"]];
function loadPrefs(): Prefs {
  try {
    return { days: "30", epic: "", ...(JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Prefs> | null) };
  } catch {
    return { days: "30", epic: "" };
  }
}

const day = (d: string) => shortDate(d).replace(/\s+/g, " ");
const hrs = (m: number) => (m >= 60 ? `${(m / 60).toFixed(m % 60 ? 1 : 0)}h` : `${Math.round(m)}m`);
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const PRIORITY: [string, string][] = [["high", "High"], ["med", "Medium"], ["low", "Low"], ["none", "None"]];

// Stats: the account's end-of-day report, printed on till roll. Every chart reads the same range and epic.
export function Stats({ all }: { all: Everything }) {
  const [prefs, setState] = useState(loadPrefs);
  const set = (p: Partial<Prefs>) => {
    const next = { ...prefs, ...p };
    setState(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* holds for this visit */ }
  };
  const { today, nowM } = all;
  const epics = useMemo(() => epicMap(all.epics), [all.epics]);
  const s = useMemo(() => {
    const tasks = all.tasks.filter((t) => !prefs.epic || (prefs.epic === NO_EPIC ? !t.epic_id : t.epic_id === prefs.epic));
    const ids = new Set(tasks.map((t) => t.id));
    const blocks = all.blocks.filter((b) => ids.has(b.task_id));
    const from = addDays(today, 1 - Number(prefs.days));
    const days = dayRange(from, today);
    const done = tasks.filter((t) => t.done && t.done_on);
    const doneIn = done.filter((t) => t.done_on! >= from);
    const perDay = countBy(done, (t) => t.done_on);
    const weeks = Array.from({ length: 12 }, (_, i) => addDays(weekOf(today), (i - 11) * 7));
    const perWeek = countBy(done, (t) => weekOf(t.done_on!));
    const open = tasks.filter((t) => !t.done);
    const leads = doneIn.map(leadDays).filter((x): x is number => x != null);
    const sized = budget(tasks, blocks, today, nowM);
    const sizedDone = sized.filter((x) => x.task.done && x.actual > 0);
    const est = sizedDone.reduce((a, x) => a + x.est, 0), act = sizedDone.reduce((a, x) => a + x.actual, 0);
    const byEpic = [...countBy(tasks, (t) => t.epic_id ?? NO_EPIC)].map(([id]) => ({
      id, title: id === NO_EPIC ? "No epic" : epics.get(id)?.title ?? "Gone",
      colour: id === NO_EPIC ? null : epics.get(id)?.colour ?? null,
      open: open.filter((t) => (t.epic_id ?? NO_EPIC) === id).length,
      done: doneIn.filter((t) => (t.epic_id ?? NO_EPIC) === id).length,
    })).filter((e) => e.open + e.done > 0).sort((a, b) => b.open + b.done - (a.open + a.done));
    const weekday = countBy(doneIn, (t) => WEEKDAYS[(new Date(t.done_on! + "T12:00:00Z").getUTCDay() + 6) % 7]);
    return {
      days, open, doneIn, leads,
      burn: burndown(tasks, days),
      daily: days.map((d) => ({ d, n: perDay.get(d) ?? 0 })),
      weekly: weeks.map((w) => ({ w, n: perWeek.get(w) ?? 0 })),
      planned: plannedByDay(blocks, dayRange(from, addDays(today, 6)), today, nowM),
      status: [...TASK_STATUSES.map((k) => [TASK_STATUS_LABEL[k], open.filter((t) => (t.status ?? "todo") === k).length] as const), ["Done", doneIn.length] as const],
      priority: PRIORITY.map(([k, l]) => [l, open.filter((t) => (t.priority ?? "none") === k).length] as const),
      overdue: open.filter((t) => t.due < today).length,
      thisWeek: done.filter((t) => t.done_on! >= weekOf(today)).length,
      streak: streak(new Set(perDay.keys()), today),
      budget: { est, act, n: sizedDone.length, worst: [...sized].filter((x) => x.actual > 0).sort((a, b) => Math.abs(b.actual - b.est) - Math.abs(a.actual - a.est)).slice(0, 8) },
      byEpic, weekday: WEEKDAYS.map((w) => ({ w, n: weekday.get(w) ?? 0 })),
    };
  }, [all, prefs, epics, today, nowM]);

  const lead = median(s.leads);
  const accuracy = s.budget.est ? Math.round((s.budget.act / s.budget.est) * 100) : null;
  const sparse = (i: number, n: number) => labelled(i, n);

  return (
    <main className="room-main stats">
      <HeaderControls><SettingsMenu>
        <SettingsPick label="Range" value={prefs.days} options={RANGES} onChange={(days) => set({ days })} />
        <SettingsPick label="Epic" value={prefs.epic}
          options={[["", "All"], ...all.epics.map((e): [string, string] => [e.id, e.title]), [NO_EPIC, "No epic"]]}
          onChange={(epic) => set({ epic })} />
      </SettingsMenu></HeaderControls>
      <div className="room-head">
        <h1 className="room-title">Stats</h1>
        <span className="stats-range">{day(s.days[0])} – {day(today)}{prefs.epic && ` · ${prefs.epic === NO_EPIC ? "No epic" : epics.get(prefs.epic)?.title ?? ""}`}</span>
      </div>

      <section className="stats-tally" aria-label="At a glance">
        <Tally n={s.doneIn.length} label="done" />
        <Tally n={s.thisWeek} label="this week" />
        <Tally n={s.open.length} label="open" />
        <Tally n={s.overdue} label="overdue" warn={s.overdue > 0} />
        <Tally n={lead == null ? "–" : `${lead}d`} label="made → done" />
        <Tally n={s.streak} label={s.streak === 1 ? "day streak" : "days streak"} />
        <Tally n={accuracy == null ? "–" : `${accuracy}%`} label="of estimate used" warn={accuracy != null && accuracy > 120} />
      </section>

      <div className="stats-grid">
        <Card title="Burndown" wide legend={<><Key k="biro">open</Key><Key k="pencil">all made</Key></>}>
          <Line points={s.burn.map((b) => ({ label: day(b.date), a: b.open, b: b.scope }))} />
        </Card>

        <Card title="Done each day" note={`${s.doneIn.length} in ${s.days.length} days`}>
          <Bars bars={s.daily.map((x, i) => ({ key: x.d, label: sparse(i, s.daily.length) ? day(x.d).slice(4) : "", title: `${day(x.d)}: ${x.n} done`, parts: [x.n] }))} />
        </Card>

        <Card title="Done each week" note="12 weeks">
          <Bars bars={s.weekly.map((x, i) => ({ key: x.w, label: i % 2 ? "" : day(x.w).slice(4), title: `Week of ${day(x.w)}: ${x.n} done`, parts: [x.n] }))} />
        </Card>

        <Card title="Hours on the line" wide legend={<><Key k="biro">gone by</Key><Key k="pencil">ahead</Key></>}>
          <Bars hours bars={s.planned.map((x, i) => ({
            key: x.date, label: sparse(i, s.planned.length) ? day(x.date).slice(4) : "", today: x.date === today,
            title: `${day(x.date)}: ${hrs(x.spent + x.ahead)} planned${x.ahead && x.spent ? `, ${hrs(x.spent)} gone by` : ""}`, parts: [x.spent, x.ahead],
          }))} />
        </Card>

        <Card title="Estimate vs time spent" note={s.budget.n ? `${s.budget.n} done: ${hrs(s.budget.est)} guessed, ${hrs(s.budget.act)} spent` : undefined}
          legend={s.budget.worst.length ? <><Key k="pencil">estimate</Key><Key k="biro">spent</Key></> : undefined}>
          {s.budget.worst.length ? <Budget rows={s.budget.worst.map((x) => ({ id: x.task.id, title: x.task.title, est: x.est, actual: x.actual, done: x.task.done }))} />
            : <p className="stats-empty">Nothing timed yet.</p>}
        </Card>

        <Card title="Where things stand">
          <Split label="Status" parts={s.status.map(([l, n]) => ({ l, n, k: l === "Done" ? "biro" : l === "Blocked" ? "red" : l === "Doing" ? "ink" : "pencil" }))} />
          <Split label="Open, by priority" parts={s.priority.map(([l, n]) => ({ l, n, k: l === "High" ? "red" : l === "None" ? "pencil" : "ink", fade: l === "Low" }))} />
        </Card>

        <Card title="By epic" note="open · done in range">
          <ul className="stats-epics">
            {s.byEpic.slice(0, 10).map((e, i) => {
              const max = Math.max(...s.byEpic.map((x) => x.open + x.done));
              return (
                <li key={e.id} style={{ "--i": i, ...(e.colour ? { "--epic": `var(--epic-${e.colour})` } : {}) } as CSSProperties}>
                  <span className="stats-epic-name"><span className="stats-dot" aria-hidden />{e.title}</span>
                  <span className="stats-epic-bar" title={`${e.title}: ${e.open} open, ${e.done} done`}>
                    <span className="is-ink" style={{ width: `${(e.open / max) * 100}%` }} />
                    <span className="is-biro" style={{ width: `${(e.done / max) * 100}%` }} />
                  </span>
                  <span className="stats-epic-n">{e.open} · {e.done}</span>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card title="Busiest days" note="done, by weekday">
          <Bars bars={s.weekday.map((x) => ({ key: x.w, label: x.w, title: `${x.w}: ${x.n} done`, parts: [x.n] }))} />
        </Card>
      </div>
    </main>
  );
}

function Tally({ n, label, warn }: { n: number | string; label: string; warn?: boolean }) {
  return (
    <p className={`stats-tile${warn ? " is-warn" : ""}`}>
      <span className="stats-n">{n}</span>
      <span className="stats-l">{label}</span>
    </p>
  );
}

function Card({ title, note, legend, wide, children }: { title: string; note?: string; legend?: ReactNode; wide?: boolean; children: ReactNode }) {
  return (
    <section className={`stats-card${wide ? " is-wide" : ""}`}>
      <header className="stats-card-head">
        <h2>{title}</h2>
        {note && <span className="stats-note">{note}</span>}
        {legend && <span className="stats-legend">{legend}</span>}
      </header>
      {children}
    </section>
  );
}

const Key = ({ k, children }: { k: string; children: ReactNode }) => <span className={`stats-key is-${k}`}>{children}</span>;

// Which of n days get a date under them: about five, the last always, none crowding it.
const labelled = (i: number, n: number) => {
  const step = Math.ceil(n / 5);
  return i === n - 1 || (i % step === 0 && n - 1 - i >= step / 2);
};

// Round the top of an axis up to a friendly number.
const nice = (n: number) => {
  if (n <= 5) return Math.max(1, Math.ceil(n));
  const p = 10 ** Math.floor(Math.log10(n));
  return [1, 2, 2.5, 5, 10].map((x) => x * p).find((x) => x >= n)!;
};

type Bar = { key: string; label: string; title: string; parts: number[]; today?: boolean };

// Columns ruled in pencil, inked from the baseline (stacked: the first part in ink, the rest in pencil above it).
function Bars({ bars, hours }: { bars: Bar[]; hours?: boolean }) {
  const top = nice(Math.max(...bars.map((b) => b.parts.reduce((a, x) => a + x, 0))) / (hours ? 60 : 1)) * (hours ? 60 : 1);
  const fmt = (v: number) => (hours ? hrs(v) : String(v));
  return (
    <div className="stats-plot">
      <div className="stats-axis" aria-hidden><span>{fmt(top)}</span><span>{fmt(top / 2)}</span><span>0</span></div>
      <div className="stats-bars" role="list">
        {bars.map((b, i) => (
          <div key={b.key} role="listitem" className={`stats-col${b.today ? " is-today" : ""}`} title={b.title} aria-label={b.title}
            style={{ "--i": i } as CSSProperties}>
            <span className="stats-stack">
              {b.parts.map((v, k) => v > 0 && <span key={k} className={k ? "is-pencil" : "is-ink"} style={{ height: `${(v / top) * 100}%` }} />)}
            </span>
            <span className="stats-x">{b.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Two lines over the days: a in ink, b in pencil. Hover a day for its numbers.
function Line({ points }: { points: { label: string; a: number; b: number }[] }) {
  const top = nice(Math.max(1, ...points.map((p) => Math.max(p.a, p.b))));
  const n = Math.max(1, points.length - 1);
  const path = (k: "a" | "b") => points.map((p, i) => `${i ? "L" : "M"}${(i / n) * 100} ${100 - (p[k] / top) * 100}`).join("");
  return (
    <div className="stats-plot">
      <div className="stats-axis" aria-hidden><span>{top}</span><span>{top / 2}</span><span>0</span></div>
      <div className="stats-line">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          <path d={path("b")} className="is-pencil" />
          <path d={`${path("a")}L100 100L0 100Z`} className="is-fill" />
          <path d={path("a")} className="is-ink" />
        </svg>
        <div className="stats-hits">
          {points.map((p, i) => (
            <span key={i} className="stats-hit" title={`${p.label}: ${p.a} open of ${p.b}`}>
              <span className="stats-hit-dot" style={{ bottom: `${(p.a / top) * 100}%` }} />
            </span>
          ))}
        </div>
        <div className="stats-xs" aria-hidden>
          {points.map((p, i) => <span key={i}>{labelled(i, points.length) ? p.label.slice(4) : ""}</span>)}
        </div>
      </div>
    </div>
  );
}

// Each task: its estimate as a pencilled box, the time spent inked across it (red where it runs over).
function Budget({ rows }: { rows: { id: string; title: string; est: number; actual: number; done: boolean }[] }) {
  const top = Math.max(...rows.map((r) => Math.max(r.est, r.actual)));
  return (
    <ul className="stats-budget">
      {rows.map((r, i) => (
        <li key={r.id} style={{ "--i": i } as CSSProperties} title={`${r.title}: ${formatDuration(r.actual)} spent of ${formatDuration(r.est)}`}>
          <span className={`stats-budget-name${r.done ? " is-done" : ""}`}>{r.title}</span>
          <span className="stats-budget-bar">
            <span className="is-est" style={{ width: `${(r.est / top) * 100}%` }} />
            <span className={r.actual > r.est ? "is-act is-over" : "is-act"} style={{ width: `${(r.actual / top) * 100}%` }} />
          </span>
          <span className={`stats-budget-n${r.actual > r.est ? " is-over" : ""}`}>{hrs(r.actual)}/{hrs(r.est)}</span>
        </li>
      ))}
    </ul>
  );
}

// One bar split into its parts, each named under it with its count.
function Split({ label, parts }: { label: string; parts: { l: string; n: number; k: string; fade?: boolean }[] }) {
  const total = parts.reduce((a, p) => a + p.n, 0) || 1;
  return (
    <div className="stats-split">
      <p className="stats-split-label">{label}</p>
      <div className="stats-split-bar">
        {parts.map((p) => p.n > 0 && <span key={p.l} className={`is-${p.k}${p.fade ? " is-fade" : ""}`} style={{ flexGrow: p.n }} title={`${p.l}: ${p.n}`} />)}
      </div>
      <ul className="stats-split-keys">
        {parts.map((p) => <li key={p.l}><span className={`stats-key is-${p.k}${p.fade ? " is-fade" : ""}`}>{p.l}</span> <b>{p.n}</b> <span className="stats-pc">{Math.round((p.n / total) * 100)}%</span></li>)}
      </ul>
    </div>
  );
}
