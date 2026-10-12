import { groupTasks, waitingDays, type View } from "@shared/board.ts";
import { DAY_END, DAY_START, dayWord, formatDuration, timedEvents, toHM, toMin } from "@shared/planning.ts";
import type { FullTask } from "@shared/snapshot.ts";
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
};

const est = (t: FullTask) => (t.estimate_mins ? `~${formatDuration(t.estimate_mins)}` : "");

function sourceLabel(t: FullTask): string {
  if (t.source === "you") return "";
  if (t.source === "jira") return `JIRA  ${t.external_id ?? ""}`.trim();
  return t.source.toUpperCase();
}

function docket(t: FullTask, hm: string | null, today: string): DocketData {
  const carried = !t.done && t.due < today;
  const high = t.priority === "high";
  const tags = t.tags.slice(0, 3);
  const tagRow: MetaRow[] = tags.length ? [{ label: "TAGS", value: tags.join(" ").toUpperCase() }] : [];
  const common = { id: t.id, done: t.done, high, hm, title: t.title.toUpperCase(), lines: wrapTitle(t.title) };
  if (carried) {
    const n = waitingDays(t.due, today);
    return {
      ...common, variant: "carried", time: "", duration: "", source: sourceLabel(t), tag: "CARRIED OVER",
      lines: [t.title.toUpperCase()],
      rows: [{ label: "WAITING", value: `${n} ${n === 1 ? "DAY" : "DAYS"}` }, { label: "DUE", value: shortDate(t.due) }, ...tagRow],
      footer: { label: "DURATION", value: est(t) || "--" },
    };
  }
  const rows: MetaRow[] = [
    ...(hm ? [{ label: "START", value: hm }] : []),
    ...(t.due !== today ? [{ label: "DUE", value: shortDate(t.due) }] : []),
    ...tagRow,
  ];
  const flags = [t.done ? "DONE" : "", high ? "! HIGH" : "", sourceLabel(t)].filter(Boolean);
  return {
    ...common, variant: "today", time: clock12(hm), duration: est(t), source: flags.join(" · "), tag: "", rows, footer: null,
  };
}

function planOf(b: BoardData, byId: Map<string, FullTask>): PlanData {
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
      id: t.id, kind: "task", startM: s, mins: pb.mins, time: clock12(pb.start), title: t.title,
      duration: formatDuration(pb.mins), current: isToday && s <= b.nowM && b.nowM < s + pb.mins, done: t.done,
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
  const plannedStart = new Map(b.blocks.filter((x) => x.date === b.date).map((x) => [x.task_id, x.start]));
  const hmOf = (t: FullTask) => t.time ?? plannedStart.get(t.id) ?? null;
  const status = groupTasks(b.tasks, b.today, { group: "status", sort: "manual", tag: "" });
  const count = (key: string) => status.find((g) => g.key === key)!.tasks.length;
  const done = count("done");
  return {
    dateLabel: longDate(b.date),
    headline: b.day?.headline ?? "",
    done,
    total: count("carried") + count("today") + done,
    plan: planOf(b, byId),
    nextUp: b.suggestions.slice(0, 3).flatMap((s) => {
      const t = byId.get(s.id);
      return t ? [{ id: t.id, title: s.title, when: whenOf(t, b), why: s.reasons[0] ?? "" }] : [];
    }),
    groups: groupTasks(b.tasks, b.today, view).map((g) => ({
      key: g.key,
      label: g.label,
      count: g.tasks.length,
      dockets: g.tasks.map((t) => docket(t, hmOf(t), b.today)),
    })),
    topPickId: b.suggestions[0]?.id ?? null,
    tags: [...new Set(b.tasks.flatMap((t) => t.tags))].sort(),
  };
}
