// View models the components render. Built from the Convex board by ./build.ts (live) or from a fixture board.
import type { Epic } from "@shared/epics.ts";
import type { Block, DayEvent } from "@shared/planning.ts";
import type { FullTask } from "@shared/snapshot.ts";

// The shape api.agent.board returns.
export type BoardData = {
  today: string;
  date: string;
  nowM: number;
  app_url: string | null;
  day: { date: string; headline?: string | null; events: DayEvent[] } | null;
  tasks: FullTask[];
  blocks: Block[];
  epics?: Epic[]; // missing on a board kept from before epics
  effort?: Record<string, { planned: number; actual: number }>; // tasks with an estimate
  suggestions: { id: string; title: string; reasons: string[] }[];
};

export type PlanBlock = {
  id: string; // the block's own id (a task can have several on a day); an event's index for events
  taskId?: string; // the planned task
  kind: "event" | "task";
  startM: number;
  mins: number;
  time: string;
  title: string;
  duration?: string;
  current?: boolean;
  done?: boolean;
  colour?: string | null; // its epic's
  calColour?: string | null; // an event's: its calendar's (CAL_COLOURS); none is the plain grey
  event?: { start?: string; end?: string; title: string; where?: string }; // an event's own fields, for its prep task
  meta?: string; // its checklist and estimate ("■■□ 2/3 · est 45m"), printed under the title when the block has room
};

export type PlanData = {
  startM: number; // first hour line, in minutes
  endM: number; // last hour line
  blocks: PlanBlock[];
  allDay: { id: string; title: string; colour?: string | null }[];
  nowM: number | null; // only when the viewed date is today
  anchorM: number; // where the plan opens scrolled to
};

export type NextUpItem = { id: string; title: string; when: string; why: string };

export type MetaRow = { label: string; value: string };

export type DocketData = {
  id: string; // the task id
  variant: "carried" | "today";
  done: boolean;
  high: boolean;
  blocked?: boolean; // its Kanban status is Blocked: stamped on the paper so it stands out
  hm: string | null; // HH:MM, planned or fixed
  time: string;
  duration: string;
  title: string;
  lines: string[];
  source: string;
  tag: string;
  rows: MetaRow[];
  footer: MetaRow | null;
  colour?: string | null; // its epic's
  list?: { done: number; total: number } | null; // its checklist, when it has one
  note?: string | null; // handwritten on the paper where there is room
  fit: 0 | 1 | 2; // how hard the title is squeezed to fit the paper: 0 as printed, 2 smallest
  progress?: { spent: number; est: number } | null; // minutes spent (planned blocks gone by) against the estimate
};

export type GroupData = { key: string; label: string; count: number; dockets: DocketData[] };

