import { useCallback, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { parseDuration, toHM } from "@shared/planning.ts";
import type { FullTask } from "@shared/snapshot.ts";
import { clock12 } from "../ui/format";
import type { BoardData } from "../ui/types";
import { useOnline } from "./offline";

export type ToastData = { id: number; kind: "undo" | "error"; message: string; undo?: () => void };

export type NewTask = {
  title: string;
  due: string;
  time: string | null;
  priority: "high" | "med" | "low" | null;
  tags: string[];
  estimate_mins: number | null;
  source: "you";
};

export type Actions = {
  offline: boolean;
  toast: ToastData | null;
  dismiss: () => void;
  add: (t: NewTask) => Promise<boolean>;
  tick: (id: string, done: boolean) => void;
  remove: (id: string) => void;
  save: (id: string, patch: Record<string, unknown>) => Promise<boolean>;
  place: (id: string, date: string, start: number, mins: number) => void;
  unplace: (id: string, date: string) => void;
  addAndPlace: (t: NewTask, date: string, start: number, mins: number) => Promise<boolean>;
  reorder: (id: string, sortOrder: number) => void;
  planTasks: (ids: string[], date: string) => Promise<void>;
};

// Patch every board query that is loaded, so the change shows at once whichever date is being viewed.
type Store = {
  getAllQueries: (q: typeof api.agent.board) => { args: any; value: BoardData | undefined }[];
  setQuery: (q: typeof api.agent.board, args: any, v: BoardData) => void;
};
const patchBoards = (store: Store, edit: (b: BoardData) => BoardData) => {
  for (const { args, value } of store.getAllQueries(api.agent.board)) {
    if (value) store.setQuery(api.agent.board, args, edit(value));
  }
};

const failure = (e: unknown, fallback: string) => {
  const data = (e as { data?: unknown })?.data;
  const msg = typeof data === "object" && data && "message" in data ? String((data as { message: unknown }).message) : "";
  return msg ? `${fallback}: ${msg}` : fallback;
};

let optimisticId = 0;
export const isOptimistic = (id: string) => id.startsWith("optimistic-");

// Every write the board makes: optimistic through Convex, with one toast at a time (Undo, or an error).
export function useActions(board: BoardData): Actions {
  const [toast, setToast] = useState<ToastData | null>(null);
  const seq = useRef(0);
  const show = useCallback((t: Omit<ToastData, "id">) => setToast({ ...t, id: ++seq.current }), []);
  const dismiss = useCallback(() => setToast(null), []);
  const live = useRef(board);
  live.current = board;

  const addTasks = useMutation(api.agent.addTasks).withOptimisticUpdate((store, { tasks }) =>
    patchBoards(store as Store, (b) => ({
      ...b,
      tasks: [
        ...b.tasks,
        ...(tasks as Partial<FullTask>[]).map((t, i): FullTask => ({
          id: `optimistic-${++optimisticId}`, title: t.title ?? "", due: t.due ?? b.today, time: t.time ?? null,
          priority: t.priority ?? null, estimate_mins: typeof t.estimate_mins === "number" ? t.estimate_mins : null,
          done: false, done_on: null, sort_order: 1e9 + i, source: t.source ?? "you", external_id: t.external_id ?? null,
          tags: Array.isArray(t.tags) ? t.tags : [], link: t.link ?? null, note: t.note ?? null, description: t.description ?? null,
        })),
      ],
    })),
  );
  const updateTask = useMutation(api.agent.updateTask).withOptimisticUpdate((store, { id, patch }) =>
    patchBoards(store as Store, (b) => ({
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
    })),
  );
  const deleteTask = useMutation(api.agent.deleteTask).withOptimisticUpdate((store, { id }) =>
    patchBoards(store as Store, (b) => ({
      ...b, tasks: b.tasks.filter((t) => t.id !== id), blocks: b.blocks.filter((x) => x.task_id !== id),
    })),
  );
  const placeBlock = useMutation(api.agent.placeBlock).withOptimisticUpdate((store, a) =>
    patchBoards(store as Store, (b) => ({
      ...b, blocks: [...b.blocks.filter((x) => !(x.task_id === a.task_id && x.date === a.date)), a],
    })),
  );

  const removeBlock = useMutation(api.agent.removeBlock).withOptimisticUpdate((store, a) =>
    patchBoards(store as Store, (b) => ({
      ...b, blocks: b.blocks.filter((x) => !(x.task_id === a.task_id && x.date === a.date)),
    })),
  );

  const planDay = useMutation(api.agent.plan);

  const fail = useCallback((what: string, e: unknown) => show({ kind: "error", message: failure(e, what) }), [show]);

  // addTasks reports validation problems in its result instead of throwing.
  const rejection = (r: unknown): string | null => {
    const res = r as { created?: { id: string }[]; errors?: { error: string }[] } | undefined;
    if (res?.errors?.length) return res.errors[0].error;
    return res?.created?.length ? null : "nothing was created";
  };

  const add = useCallback(
    async (t: NewTask) => {
      try {
        const bad = rejection(await addTasks({ tasks: [t] }));
        if (bad) {
          show({ kind: "error", message: `Couldn't add that: ${bad}` });
          return false;
        }
        return true;
      } catch (e) {
        fail("Couldn't add that", e);
        return false;
      }
    },
    [addTasks, fail, show],
  );

  const tick = useCallback(
    (id: string, done: boolean) => {
      if (isOptimistic(id)) return;
      const t = live.current.tasks.find((x) => x.id === id);
      show({
        kind: "undo", message: `${done ? "Done" : "Reopened"}: ${t?.title ?? "task"}`,
        undo: () => void updateTask({ id, patch: { done: !done } }).catch((e) => fail("Couldn't undo", e)),
      });
      updateTask({ id, patch: { done } }).catch((e) => fail("Couldn't save that", e));
    },
    [updateTask, show, fail],
  );

  const remove = useCallback(
    (id: string) => {
      if (isOptimistic(id)) return;
      const b = live.current;
      const t = b.tasks.find((x) => x.id === id);
      if (!t) return;
      const block = b.blocks.find((x) => x.task_id === id && x.date === b.date);
      show({
        kind: "undo", message: `Deleted: ${t.title}`,
        undo: () => {
          void (async () => {
            try {
              const r = await addTasks({
                tasks: [{
                  title: t.title, description: t.description, note: t.note, link: t.link, due: t.due, time: t.time,
                  priority: t.priority, estimate_mins: t.estimate_mins, tags: t.tags, source: t.source, external_id: t.external_id,
                }],
              });
              const bad = rejection(r);
              if (bad) return show({ kind: "error", message: `Couldn't undo: ${bad}` });
              const created = (r as { created: { id: string }[] }).created[0].id;
              if (t.done) await updateTask({ id: created, patch: { done: true, done_on: t.done_on } });
              if (block) await placeBlock({ task_id: created, date: block.date, start: block.start, mins: block.mins });
            } catch (e) {
              fail("Couldn't undo", e);
            }
          })();
        },
      });
      deleteTask({ id }).catch((e) => fail("Couldn't delete that", e));
    },
    [deleteTask, addTasks, updateTask, placeBlock, show, fail],
  );

  // Resolves false when the server refused, so the sheet can come back with the draft.
  const save = useCallback(
    async (id: string, patch: Record<string, unknown>) => {
      if (isOptimistic(id)) return false;
      try {
        await updateTask({ id, patch });
        return true;
      } catch (e) {
        fail("Couldn't save that", e);
        return false;
      }
    },
    [updateTask, fail],
  );

  // Callers clamp (lib/timeline.ts); the server clamps again. Undo restores the block as it was, or unplans.
  const place = useCallback(
    (id: string, date: string, start: number, mins: number) => {
      if (isOptimistic(id)) return;
      const b = live.current;
      const t = b.tasks.find((x) => x.id === id);
      const prev = b.blocks.find((x) => x.task_id === id && x.date === date);
      show({
        kind: "undo", message: `${prev ? "Moved" : "Planned"}: ${t?.title ?? "task"}`,
        undo: () => {
          const back = prev
            ? placeBlock({ task_id: id, date, start: prev.start, mins: prev.mins })
            : removeBlock({ task_id: id, date });
          void back.catch((e) => fail("Couldn't undo", e));
        },
      });
      placeBlock({ task_id: id, date, start: toHM(start), mins }).catch((e) => fail("Couldn't plan that", e));
    },
    [placeBlock, removeBlock, show, fail],
  );

  const unplace = useCallback(
    (id: string, date: string) => {
      const b = live.current;
      const prev = b.blocks.find((x) => x.task_id === id && x.date === date);
      if (!prev || isOptimistic(id)) return;
      const t = b.tasks.find((x) => x.id === id);
      show({
        kind: "undo", message: `Unplanned: ${t?.title ?? "task"}`,
        undo: () => void placeBlock({ task_id: id, date, start: prev.start, mins: prev.mins }).catch((e) => fail("Couldn't undo", e)),
      });
      removeBlock({ task_id: id, date }).catch((e) => fail("Couldn't unplan that", e));
    },
    [placeBlock, removeBlock, show, fail],
  );

  const addAndPlace = useCallback(
    async (t: NewTask, date: string, start: number, mins: number) => {
      try {
        const r = await addTasks({ tasks: [t] });
        const bad = rejection(r);
        if (bad) {
          show({ kind: "error", message: `Couldn't add that: ${bad}` });
          return false;
        }
        const id = (r as { created: { id: string }[] }).created[0].id;
        await placeBlock({ task_id: id, date, start: toHM(start), mins });
        return true;
      } catch (e) {
        fail("Couldn't plan that", e);
        return false;
      }
    },
    [addTasks, placeBlock, show, fail],
  );

  // A drop in a rail: only sort_order changes.
  const reorder = useCallback(
    (id: string, sortOrder: number) => {
      if (isOptimistic(id)) return;
      updateTask({ id, patch: { sort_order: sortOrder } }).catch((e) => fail("Couldn't move that", e));
    },
    [updateTask, fail],
  );

  // The server's auto-plan puts these into the first free gaps. Undo removes whatever it placed.
  const planTasks = useCallback(
    async (ids: string[], date: string) => {
      const real = ids.filter((id) => !isOptimistic(id));
      if (!real.length) return;
      // What was on the line before: Undo puts moved blocks back and removes only the new ones.
      const before = new Map(live.current.blocks.filter((x) => x.date === date).map((x) => [x.task_id, x]));
      try {
        const r = (await planDay({ date, task_ids: real, commit: true, now: Date.now() })) as {
          proposed: { task_id: string; title: string; start: string }[];
          unplaced: { title: string; reason: string }[];
        };
        if (!r.proposed.length) {
          const u = r.unplaced[0];
          show({ kind: "error", message: u ? `Couldn't plan ${u.title}: ${u.reason}` : "Nothing to plan" });
          return;
        }
        const placed = r.proposed;
        show({
          kind: "undo",
          message:
            (placed.length === 1 ? `Planned ${placed[0].title} for ${clock12(placed[0].start)}` : `Planned ${placed.length}`) +
            (r.unplaced.length ? `, ${r.unplaced.length} didn't fit` : ""),
          undo: () =>
            void (async () => {
              for (const p of placed) {
                const was = before.get(p.task_id);
                await (was
                  ? placeBlock({ task_id: p.task_id, date, start: was.start, mins: was.mins })
                  : removeBlock({ task_id: p.task_id, date }));
              }
            })().catch((e) => fail("Couldn't undo", e)),
        });
      } catch (e) {
        fail("Couldn't plan that", e);
      }
    },
    [planDay, placeBlock, removeBlock, show, fail],
  );

  // Offline, every write is a quiet no-op (the UI disables its controls; this is the backstop).
  const online = useOnline();
  const w = useRef(online);
  w.current = online;
  const gate = <A extends unknown[], R>(fn: (...a: A) => R, off: R) => (...a: A): R => (w.current ? fn(...a) : off);
  return {
    offline: !online, toast, dismiss,
    add: gate(add, Promise.resolve(false)), tick: gate(tick, undefined), remove: gate(remove, undefined),
    save: gate(save, Promise.resolve(false)), place: gate(place, undefined), unplace: gate(unplace, undefined),
    addAndPlace: gate(addAndPlace, Promise.resolve(false)), reorder: gate(reorder, undefined),
    planTasks: gate(planTasks, Promise.resolve()),
  };
}
