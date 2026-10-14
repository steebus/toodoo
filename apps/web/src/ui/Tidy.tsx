import { AnimatePresence, m, useIsPresent } from "motion/react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { epicMap } from "@shared/epics.ts";
import { addDays, daysBetween, formatDuration, parseDuration } from "@shared/planning.ts";
import { parseQuickAdd } from "@shared/quickadd.ts";
import { isParked, piles, PILES, type Pile, type TidyTask } from "@shared/tidy.ts";
import type { Everything } from "../lib/stats";
import type { WorkActions } from "../lib/useWork";
import { compactDate } from "./format";
import { epicStyle } from "./Slip";
import { Toast } from "./Toast";

const LABEL: Record<Pile, string> = { quiet: "Gone quiet", undated: "No date", unsized: "No estimate" };
const SIZES: [string, number][] = [["5m", 5], ["15m", 15], ["30m", 30], ["1h", 60], ["2h", 120], ["4h", 240]];
type Exit = "file" | "skip";
// A card filed goes up off the pile; a skipped one slides aside.
const CARD = {
  in: { opacity: 0, y: 24, scale: 0.97 },
  at: { opacity: 1, y: 0, x: 0, scale: 1, rotate: 0 },
  out: (how: Exit) => (how === "skip" ? { opacity: 0, x: 140, rotate: 4 } : { opacity: 0, y: -60, rotate: -3, scale: 0.96 }),
};

// Tidy up: the open tasks that want a look, in piles, one card at a time with the one thing it needs ready to
// take: a date, an estimate, or (gone quiet) what becomes of it. Enter files it and the next comes up.
export function Tidy({ all, actions }: { all: Everything; actions: WorkActions }) {
  const p = useMemo(() => piles(all.tasks, all.blocks, all.today), [all]);
  const [pile, setPile] = useState<Pile>(() => PILES.find((k) => p[k].length) ?? "quiet");
  // Filed here and not yet gone from the pile (the server is a beat behind); skipped, for this visit.
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [how, setHow] = useState<Exit>("file");
  useEffect(() => {
    const inPile = new Set(PILES.flatMap((k) => p[k].map((t) => t.id)));
    setGone((g) => ([...g].every((id) => inPile.has(id)) ? g : new Set([...g].filter((id) => inPile.has(id)))));
  }, [p]);

  const queue = p[pile].filter((t) => !gone.has(t.id) && !skipped.has(t.id));
  const card = queue[0];
  const epics = useMemo(() => epicMap(all.epics), [all.epics]);
  const off = actions.offline;

  const file = (t: TidyTask, patch: Partial<TidyTask>, message: string) => {
    if (off) return;
    setHow("file");
    setGone((g) => new Set(g).add(t.id));
    actions.move(t.id, patch, message);
  };
  const skip = (t: TidyTask) => { setHow("skip"); setSkipped((s) => new Set(s).add(t.id)); };
  const drop = (t: TidyTask) => { if (off) return; setHow("file"); setGone((g) => new Set(g).add(t.id)); actions.remove(t.id); };

  return (
    <main className="room-main tidy">
      <h1 className="sr-only">Tidy up</h1>
      <div className="tidy-piles" role="tablist" aria-label="Piles">
        {PILES.map((k) => (
          <button key={k} type="button" role="tab" aria-selected={pile === k} className="tidy-pile" onClick={() => setPile(k)}>
            {LABEL[k]}
            <span className="count-chip">{p[k].filter((t) => !gone.has(t.id)).length}</span>
          </button>
        ))}
      </div>
      <div className="tidy-stage">
        <AnimatePresence mode="popLayout" custom={how} initial={false}>
          {card ? (
            <m.article key={card.id} className="tidy-card" style={epicStyle(card.epic_id ? epics.get(card.epic_id) : undefined)}
              custom={how} variants={CARD} initial="in" animate="at" exit="out" transition={{ type: "spring", stiffness: 420, damping: 34 }}
              aria-label={card.title}>
              <CardFace t={card} today={all.today} epic={card.epic_id ? epics.get(card.epic_id)?.title : undefined} left={queue.length} />
              {pile === "quiet" && <QuietKeys key={card.id} t={card} today={all.today} off={off} file={file} skip={skip} drop={drop} />}
              {pile === "undated" && <DateKey key={card.id} t={card} today={all.today} nowM={all.nowM} off={off} file={file} skip={skip} />}
              {pile === "unsized" && <SizeKey key={card.id} t={card} off={off} file={file} skip={skip} />}
            </m.article>
          ) : (
            <m.div key={`clear-${pile}`} className="tidy-clear" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
              <p className="tidy-clear-word">{skipped.size && p[pile].some((t) => skipped.has(t.id)) ? "Round done" : "All tidy"}</p>
              {p[pile].some((t) => skipped.has(t.id)) && (
                <button type="button" className="room-button" onClick={() => setSkipped(new Set())}>Go round again</button>
              )}
            </m.div>
          )}
        </AnimatePresence>
      </div>
      <Toast toast={actions.toast} onDismiss={actions.dismiss} />
    </main>
  );
}

function CardFace({ t, today, epic, left }: { t: TidyTask; today: string; epic?: string; left: number }) {
  const quiet = daysBetween(t.touched_on, today);
  return (
    <>
      <p className="tidy-kicker">
        <span>{quiet <= 0 ? "TOUCHED TODAY" : `${quiet} ${quiet === 1 ? "DAY" : "DAYS"} ${t.status === "backlog" ? "IN BACKLOG" : t.status === "blocked" ? "BLOCKED" : "QUIET"}`}</span>
        <span>{left} LEFT</span>
      </p>
      <h2 className="tidy-title">{t.title}</h2>
      <p className="tidy-meta">
        {epic && <span className="tidy-epic"><span className="stats-dot" aria-hidden />{epic}</span>}
        {t.priority && <span className={t.priority === "high" ? "is-high" : undefined}>{t.priority === "med" ? "medium" : t.priority}</span>}
        {t.due && <span className={t.due < today ? "is-high" : undefined}>due {compactDate(t.due)}</span>}
        {t.estimate_mins && <span>~{formatDuration(t.estimate_mins)}</span>}
        {t.tags.map((x) => <span key={x}>#{x}</span>)}
      </p>
      {(t.description || t.note) && <p className="tidy-desc">{t.description || t.note}</p>}
    </>
  );
}

type Keys = { t: TidyTask; off: boolean; file: (t: TidyTask, patch: Partial<TidyTask>, message: string) => void; skip: (t: TidyTask) => void };

// Gone quiet: one key each. Today, Keep (its clock starts again), back To do (when parked), Backlog, Done, Delete, Skip.
function QuietKeys({ t, today, off, file, skip, drop }: Keys & { today: string; drop: (t: TidyTask) => void }) {
  const keys = ([
    ["t", "Today", () => file(t, { due: today, ...(isParked(t) ? { status: "todo" as const } : {}) }, `Today: ${t.title}`)],
    ["k", "Keep", () => file(t, { status: t.status ?? "todo" }, `Kept: ${t.title}`)],
    isParked(t) && ["o", "To do", () => file(t, { status: "todo" }, `To do: ${t.title}`)],
    t.status !== "backlog" && ["b", "Backlog", () => file(t, { status: "backlog" }, `Backlog: ${t.title}`)],
    ["d", "Done", () => file(t, { done: true }, `Done: ${t.title}`)],
    ["x", "Delete", () => drop(t), "is-delete"],
    ["s", "Skip", () => skip(t), "is-skip"],
  ]).filter(Boolean) as [string, string, () => void, string?][];
  const live = useRef(keys);
  live.current = keys;
  const present = useIsPresent(); // a card on its way out no longer takes keys
  const here = useRef(present);
  here.current = present;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!here.current || e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement).closest("input, select, textarea, dialog")) return;
      const hit = live.current.find(([k]) => k === e.key.toLowerCase()) ?? (e.key === "ArrowRight" ? live.current.find(([k]) => k === "s") : undefined);
      if (!hit) return;
      e.preventDefault();
      hit[2]();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <div className="tidy-keys">
      {keys.map(([k, label, act, cls]) => (
        <button key={k} type="button" className={`tidy-key ${cls ?? ""}`} disabled={off && k !== "s"} onClick={act}>
          {label}<kbd>{k.toUpperCase()}</kbd>
        </button>
      ))}
    </div>
  );
}

// The one field, focused, with its usual answers beside it. Enter files what it reads; an empty Enter skips.
function KeyField({ t, off, read, show, onFile, skip, picks, placeholder }: Pick<Keys, "t" | "off" | "skip"> & {
  read: (s: string) => unknown; show: (v: never) => string; onFile: (v: never) => void; picks: [string, () => void][]; placeholder: string;
}) {
  const [text, setText] = useState("");
  const v = text.trim() ? read(text) : null;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return skip(t);
    if (v != null) onFile(v as never);
  };
  return (
    <form className="tidy-field" onSubmit={submit}>
      <span className="tidy-input">
        <input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} aria-label={placeholder}
          disabled={off} autoComplete="off" spellCheck={false} aria-invalid={!!text.trim() && v == null || undefined} />
        <AnimatePresence>
          {v != null && (
            <m.span key="read" className="tidy-read" initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
              → {show(v as never)}
            </m.span>
          )}
        </AnimatePresence>
      </span>
      <div className="tidy-keys">
        {picks.map(([label, act]) => <button key={label} type="button" className="tidy-key" disabled={off} onClick={act}>{label}</button>)}
        <button type="button" className="tidy-key is-skip" onClick={() => skip(t)}>Skip<kbd>↵</kbd></button>
      </div>
    </form>
  );
}

function DateKey({ t, today, nowM, off, file, skip }: Keys & { today: string; nowM: number }) {
  const dow = new Date(today + "T00:00:00Z").getUTCDay();
  const set = (due: string) => file(t, { due }, `Due ${compactDate(due)}: ${t.title}`);
  return (
    <KeyField t={t} off={off} skip={skip} placeholder="When? fri, tomorrow, 22/10"
      read={(s) => parseQuickAdd(`x ${s}`, today, nowM).due} show={(d: string) => compactDate(d)} onFile={set}
      picks={[
        ["Today", () => set(today)],
        ["Tomorrow", () => set(addDays(today, 1))],
        ["Saturday", () => set(addDays(today, (6 - dow + 7) % 7 || 7))],
        ["Next week", () => set(addDays(today, ((1 - dow + 7) % 7) || 7))],
        ["Backlog", () => file(t, { status: "backlog" }, `Backlog: ${t.title}`)],
      ]} />
  );
}

function SizeKey({ t, off, file, skip }: Keys) {
  const set = (mins: number) => file(t, { estimate_mins: mins }, `~${formatDuration(mins)}: ${t.title}`);
  return (
    <KeyField t={t} off={off} skip={skip} placeholder="How long? 20, 45m, 1h 30m"
      read={(s) => { const n = parseDuration(s.replace(/^~/, "")); return n && n >= 1 && n <= 1440 ? n : null; }}
      show={(n: number) => formatDuration(n)} onFile={set}
      picks={SIZES.map(([l, n]) => [l, () => set(n)])} />
  );
}
