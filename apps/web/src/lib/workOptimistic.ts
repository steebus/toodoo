import { api } from "@convex/_generated/api";
import type { Epic } from "@shared/epics.ts";
import type { FullTask } from "@shared/snapshot.ts";
import type { BoardData } from "../ui/types";
import * as opt from "./optimistic";

// The optimistic side of the Board and Epics screens: every loaded workspace query, and any loaded day boards,
// change at once. Pure, so they test against a fake store.
export type WorkData = { today: string; epics: Epic[]; tasks: FullTask[]; done_counts: Record<string, number> };
type Q = typeof api.epics.workspace | typeof api.agent.board;
export type WorkStore = {
  getAllQueries: (q: any) => { args: any; value: any }[];
  setQuery: (q: any, args: any, v: any) => void;
};

const patchWork = (store: WorkStore, edit: (w: WorkData) => WorkData) => {
  for (const { args, value } of store.getAllQueries(api.epics.workspace as Q)) {
    if (value) store.setQuery(api.epics.workspace, args, edit(value as WorkData));
  }
};
const patchBoards = (store: WorkStore, edit: (b: BoardData) => BoardData) => opt.patchBoards(store as opt.Store, edit);

export const updateTask = (store: WorkStore, a: { id: string; patch: unknown }) => {
  opt.updateTask(store as opt.Store, a);
  const p = a.patch as Partial<FullTask>;
  patchWork(store, (w) => {
    const was = w.tasks.find((t) => t.id === a.id);
    if (!was) return w;
    const next = { ...was, ...p };
    if (p.done === true) next.done_on = p.done_on ?? w.today;
    if (p.done === false) next.done_on = null;
    // Keep the epics' done counts in step: out of the old epic's, into the new one's.
    const counts = { ...w.done_counts };
    if (was.done && was.epic_id) counts[was.epic_id] = Math.max(0, (counts[was.epic_id] ?? 0) - 1);
    if (next.done && next.epic_id) counts[next.epic_id] = (counts[next.epic_id] ?? 0) + 1;
    return { ...w, done_counts: counts, tasks: w.tasks.map((t) => (t.id === a.id ? next : t)) };
  });
};

let n = 0;
export const addTasks = (store: WorkStore, a: { tasks: unknown[] }) => {
  opt.addTasks(store as opt.Store, a);
  patchWork(store, (w) => ({
    ...w,
    tasks: [
      ...w.tasks,
      ...(a.tasks as Partial<FullTask>[]).map((t, i): FullTask => ({
        id: `optimistic-w${++n}`, title: t.title ?? "", due: t.due ?? w.today, time: t.time ?? null, priority: t.priority ?? null,
        estimate_mins: typeof t.estimate_mins === "number" ? t.estimate_mins : null, done: false, done_on: null,
        sort_order: typeof t.sort_order === "number" ? t.sort_order : 1e9 + i, source: t.source ?? "you", external_id: null,
        tags: Array.isArray(t.tags) ? t.tags : [], link: null, note: null, description: null,
        epic_id: t.epic_id ?? null, status: t.status ?? "todo",
      })),
    ],
  }));
};

export const deleteTask = (store: WorkStore, a: { id: string }) => {
  opt.deleteTask(store as opt.Store, a);
  patchWork(store, (w) => ({ ...w, tasks: w.tasks.filter((t) => t.id !== a.id) }));
};

const editEpics = (store: WorkStore, edit: (e: Epic[]) => Epic[], tasks?: (t: FullTask) => FullTask) => {
  patchWork(store, (w) => ({ ...w, epics: edit(w.epics), tasks: tasks ? w.tasks.map(tasks) : w.tasks }));
  patchBoards(store, (b) => ({ ...b, epics: edit(b.epics ?? []), tasks: tasks ? b.tasks.map(tasks) : b.tasks }));
};

export const createEpic = (store: WorkStore, a: { epic: unknown }) => {
  const e = a.epic as Partial<Epic>;
  editEpics(store, (list) => [...list, {
    id: `optimistic-e${++n}`, title: e.title ?? "", description: e.description ?? null, priority: e.priority ?? null,
    status: e.status ?? "planned", sort_order: 1e12, colour: e.colour ?? null,
  }]);
};

export const updateEpic = (store: WorkStore, a: { id: string; patch: unknown }) =>
  editEpics(store, (list) => list.map((e) => (e.id === a.id ? { ...e, ...(a.patch as Partial<Epic>) } : e)));

export const removeEpic = (store: WorkStore, a: { id: string }) =>
  editEpics(store, (list) => list.filter((e) => e.id !== a.id), (t) => (t.epic_id === a.id ? { ...t, epic_id: null } : t));
