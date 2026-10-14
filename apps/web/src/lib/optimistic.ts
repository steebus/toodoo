import { api } from "@convex/_generated/api";
import { parseDuration } from "@shared/planning.ts";
import type { FullTask } from "@shared/snapshot.ts";
import type { BoardData } from "../ui/types";

// The optimistic updaters behind useActions, pure so they can be tested against a fake store.
// Each patches every board query that is loaded, so the change shows at once whichever date is being viewed.
export type Store = {
  getAllQueries: (q: typeof api.agent.board) => { args: any; value: BoardData | undefined }[];
  setQuery: (q: typeof api.agent.board, args: any, v: BoardData) => void;
};
type Block = BoardData["blocks"][number];

export const patchBoards = (store: Store, edit: (b: BoardData) => BoardData) => {
  for (const { args, value } of store.getAllQueries(api.agent.board)) {
    if (value) store.setQuery(api.agent.board, args, edit(value));
  }
};

let optimisticId = 0;
export const isOptimistic = (id: string) => id.startsWith("optimistic-");

export const addTasks = (store: Store, { tasks }: { tasks: unknown[] }) =>
  patchBoards(store, (b) => ({
    ...b,
    tasks: [
      ...b.tasks,
      ...(tasks as Partial<FullTask>[]).map((t, i): FullTask => ({
        id: `optimistic-${++optimisticId}`, title: t.title ?? "", due: t.due ?? null, time: t.time ?? null,
        priority: t.priority ?? null, estimate_mins: typeof t.estimate_mins === "number" ? t.estimate_mins : null,
        done: false, done_on: null, sort_order: 1e9 + i, source: t.source ?? "you", external_id: t.external_id ?? null,
        tags: Array.isArray(t.tags) ? t.tags : [], link: t.link ?? null, note: t.note ?? null, description: t.description ?? null,
        epic_id: t.epic_id ?? null, status: t.status ?? "todo",
      })),
    ],
  }));

export const updateTask = (store: Store, { id, patch }: { id: string; patch: unknown }) =>
  patchBoards(store, (b) => ({
    ...b,
    tasks: b.tasks.map((t) => {
      if (t.id !== id) return t;
      const p = patch as Partial<FullTask>;
      const next = { ...t, ...p };
      const e = (patch as { estimate_mins?: unknown }).estimate_mins;
      if (e !== undefined) {
        const mins = typeof e === "string" ? parseDuration(e) : e;
        next.estimate_mins = typeof mins === "number" && Number.isFinite(mins) ? Math.round(mins) : null;
      }
      if (p.done === true) next.done_on = p.done_on ?? b.today;
      if (p.done === false) next.done_on = null;
      return next;
    }),
  }));

export const deleteTask = (store: Store, { id }: { id: string }) =>
  patchBoards(store, (b) => ({
    ...b, tasks: b.tasks.filter((t) => t.id !== id), blocks: b.blocks.filter((x) => x.task_id !== id),
  }));

// With block_id, that block moves; without, the task gets another block (an optimistic id until the server's).
let optimisticBlock = 0;
export const placeBlock = (store: Store, a: Block & { block_id?: string }) => {
  const { block_id, ...row } = a;
  const id = block_id ?? `optimistic-b${++optimisticBlock}`;
  patchBoards(store, (b) => ({
    ...b, blocks: [...b.blocks.filter((x) => !(block_id && x.id === block_id)), { ...row, id }],
  }));
};

// One block (block_id), or every block the task has that day.
export const removeBlock = (store: Store, a: { task_id: string; date: string; block_id?: string }) =>
  patchBoards(store, (b) => ({
    ...b, blocks: b.blocks.filter((x) => (a.block_id ? x.id !== a.block_id : !(x.task_id === a.task_id && x.date === a.date))),
  }));
