// View models the components render. Built from the Convex board by ./build.ts (live) or from a fixture board.
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
  suggestions: { id: string; title: string; reasons: string[] }[];
};

export type PlanBlock = {
  id: string; // the task id for planned tasks
  kind: "event" | "task";
  startM: number;
  mins: number;
  time: string;
  title: string;
  duration?: string;
  current?: boolean;
  done?: boolean;
};

export type PlanData = {
  startM: number; // first hour line, in minutes
  endM: number; // last hour line
  blocks: PlanBlock[];
  allDay: { id: string; title: string }[];
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
  hm: string | null; // HH:MM, planned or fixed
  time: string;
  duration: string;
  title: string;
  lines: string[];
  source: string;
  tag: string;
  rows: MetaRow[];
  footer: MetaRow | null;
};

export type GroupData = { key: string; label: string; count: number; dockets: DocketData[] };

