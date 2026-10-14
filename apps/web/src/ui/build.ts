import { groupTasks, waitingDays, type View } from "@shared/board.ts";
import { effectivePriority, epicMap, type Epic } from "@shared/epics.ts";
import { DAY_END, DAY_START, dayWord, formatDuration, timedEvents, toHM, toMin } from "@shared/planning.ts";
import { checklistProgress, type FullTask } from "@shared/snapshot.ts";
import { clock12, longDate, shortDate, wrapTitle } from "./format";
import type { BoardData, DocketData, GroupData, MetaRow, NextUpItem, PlanBlock, PlanData } from "./types";

export type PassModel = {
  dateLabel: string;
  headline: string;
  done: number;
  total: number;
  plan: PlanData;
  nextUp: NextUpItem[];
  groups: GroupData[];
  topPickId: string | null;
  tags: string[];
  epics: Epic[];
};

const est = (t: FullTask) => (t.estimate_mins ? `~${formatDuration(t.estimate_mins)}` : "");

function sourceLabel(t: FullTask): string {
  if (t.source === "you") return "";
  if (t.source === "jira") return `JIRA  ${(t.external_id ?? "").replace(/^jira:/, "")}`.trim();
  return t.source.toUpperCase();
}

// A checklist as the ticket printer would put it: a box a step (up to eight), then the count.
export const listLine = (p: { done: number; total: number }) =>
  `${p.total <= 8 ? "■".repeat(p.done) + "□".repeat(p.total - p.done) + " " : ""}${p.done}/${p.total}`;

// Long titles print smaller and on more lines rather than being cut off.
export const fitOf = (title: string): 0 | 1 | 2 => (title.length <= 24 ? 0 : title.length <= 48 ? 1 : 2);

// The rows print what the paper doesn't already show: the time and duration are in its head, the epic is its colour.
export function docket(t: FullTask, hm: string | null, today: string, epic?: Epic, spent?: number): DocketData {
  const carried = !t.done && t.due < today;
  const high = effectivePriority(t, epic) === "high";
  const list = checklistProgress(t.checklist);
  const listRow: MetaRow[] = list ? [{ label: "LIST", value: listLine(list) }] : [];
  const tags = t.tags.slice(0, 3);
  const tagRow: MetaRow[] = tags.length ? [{ label: "TAGS", value: tags.join(" ").toUpperCase() }] : [];
  const common = {
    id: t.id, done: t.done, high, hm, title: t.title.toUpperCase(), lines: wrapTitle(t.title), colour: epic?.colour ?? null,
    fit: fitOf(t.title), progress: t.estimate_mins && spent ? { spent, est: t.estimate_mins } : null, list, note: t.note?.trim() || null,
  };
  if (carried) {
    const n = waitingDays(t.due, today);
    return {
      // The red slot over the title is the data itself (how long it has waited), not a kicker.
      ...common, variant: "carried", time: "", duration: est(t), source: sourceLabel(t), tag: `${n} ${n === 1 ? "DAY" : "DAYS"}`,
      lines: [t.title.toUpperCase()],
      rows: [{ label: "DUE", value: shortDate(t.due) }, ...listRow, ...tagRow].slice(0, 3),
      footer: null,
    };
  }
  const rows: MetaRow[] = [
    ...listRow,
    ...(t.due !== today ? [{ label: "DUE", value: shortDate(t.due) }] : []),
    ...tagRow,
  ].slice(0, 3); // the paper has room for three
  const flags = [t.done ? "DONE" : "", high ? "! HIGH" : "", sourceLabel(t)].filter(Boolean);
  return {
    ...common, variant: "today", time: clock12(hm), duration: est(t), source: flags.join(" · "), tag: "", rows, footer: null,
  };
}

// A plan block's second line: its checklist and estimate, or nothing.
const planMeta = (t: FullTask) => {
  const list = checklistProgress(t.checklist);
  return [list && listLine(list), t.estimate_mins && `est ${formatDuration(t.estimate_mins)}`].filter(Boolean).join(" · ") || undefined;
};

function planOf(b: BoardData, byId: Map<string, FullTask>, colourOf: (t: FullTask) => string | null): PlanData {
  const isToday = b.date === b.today;
  const blocks: PlanBlock[] = [];
  timedEvents(b.day?.events ?? []).forEach((e, i) => {
    blocks.push({ id: `event-${i}`, kind: "event", startM: e.s, mins: e.e - e.s, time: clock12(toHM(e.s)), title: e.title });
  });
  for (const pb of b.blocks) {
    const t = byId.get(pb.task_id);
    const s = toMin(pb.start);
    if (pb.date !== b.date || !t || s == null) continue;
    blocks.push({
      id: pb.id ?? `${t.id}@${pb.start}`, taskId: t.id, kind: "task", startM: s, mins: pb.mins, time: clock12(pb.start), title: t.title,
      // The heavy rule marks the top pick (the docket with the biro ring), as the comp does.
      duration: formatDuration(pb.mins), current: t.id === b.suggestions[0]?.id, done: t.done, colour: colourOf(t),
      meta: planMeta(t),
    });
  }
  blocks.sort((x, y) => x.startM - y.startM);
  // The now-line must always land on the grid, even at 05:30 or 22:30.
  const nowEdge = isToday ? [b.nowM] : [];
  const lo = Math.min(DAY_START, ...nowEdge, ...blocks.map((x) => x.startM));
  const hi = Math.max(DAY_END, ...nowEdge, ...blocks.map((x) => x.startM + x.mins));
  const startM = Math.floor(lo / 60) * 60;
  const endM = Math.min(24 * 60, Math.ceil(hi / 60) * 60);
  return {
    startM, endM, blocks,
    allDay: (b.day?.events ?? []).flatMap((e, i) => (e.allDay ? [{ id: `allday-${i}`, title: e.title || "Untitled" }] : [])),
    nowM: isToday ? b.nowM : null,
    anchorM: isToday ? b.nowM : (blocks[0]?.startM ?? 9 * 60),
  };
}

function whenOf(t: FullTask, b: BoardData): string {
  const block = b.blocks.find((x) => x.task_id === t.id && x.date === b.date);
  if (block && b.date === b.today) {
    const d = (toMin(block.start) ?? 0) - b.nowM;
    return d > 0 ? `Starts in ${formatDuration(d)}` : `Planned ${clock12(block.start)}`;
  }
  if (t.time) return `At ${clock12(t.time)}`;
  return `Due ${dayWord(t.due, b.today)}`;
}

export function buildPass(b: BoardData, view: View): PassModel {
  const byId = new Map(b.tasks.map((t) => [t.id, t]));
  // A docket's START is its first block of the day (it may have several).
  const plannedStart = new Map<string, string>();
  for (const x of [...b.blocks].filter((x) => x.date === b.date).sort((p, q) => (toMin(q.start) ?? 0) - (toMin(p.start) ?? 0))) {
    plannedStart.set(x.task_id, x.start);
  }
  const hmOf = (t: FullTask) => t.time ?? plannedStart.get(t.id) ?? null;
  const epics = epicMap(b.epics);
  const epicOf = (t: FullTask) => (t.epic_id ? epics.get(t.epic_id) : undefined);
  const status = groupTasks(b.tasks, b.today, { group: "status", sort: "manual", tag: "" });
  const count = (key: string) => status.find((g) => g.key === key)!.tasks.length;
  const done = count("done");
  return {
    dateLabel: longDate(b.date),
    headline: b.day?.headline ?? "",
    done,
    total: count("carried") + count("today") + done,
    plan: planOf(b, byId, (t) => epicOf(t)?.colour ?? null),
    nextUp: b.suggestions.slice(0, 3).flatMap((s) => {
      const t = byId.get(s.id);
      if (!t) return [];
      const when = whenOf(t, b);
      // A reason that says what `when` already says ("Due today" · "due today", "At 2:00" · "at 2pm") is dropped.
      const head = (x: string) => x.split(" ")[0].toLowerCase();
      return [{ id: t.id, title: s.title, when, why: s.reasons.find((r) => head(r) !== head(when)) ?? "" }];
    }),
    groups: groupTasks(b.tasks, b.today, view, b.epics).map((g) => ({
      key: g.key,
      label: g.label,
      count: g.tasks.length,
      dockets: g.tasks.map((t) => docket(t, hmOf(t), b.today, epicOf(t), b.effort?.[t.id]?.actual)),
    })),
    topPickId: b.suggestions[0]?.id ?? null,
    tags: [...new Set(b.tasks.flatMap((t) => t.tags))].sort(),
    epics: (b.epics ?? []).filter((e) => e.status !== "done" || b.tasks.some((t) => t.epic_id === e.id)),
  };
}
