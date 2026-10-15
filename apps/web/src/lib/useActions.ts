import { useCallback, useRef, useState } from "react";
import { useConvexConnectionState, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { dayWord, formatDuration, toHM } from "@shared/planning.ts";
import { clock12 } from "../ui/format";
import type { BoardData } from "../ui/types";
import { useNoNetwork, useOffline } from "./offline";
import * as opt from "./optimistic";
import { isOptimistic, type Store } from "./optimistic";

export { isOptimistic };

export type ToastData = { id: number; kind: "undo" | "error"; message: string; undo?: () => void };

export type NewTask = {
  title: string;
  due: string | null;
  time: string | null;
  priority: "high" | "med" | "low" | null;
  tags: string[];
  estimate_mins: number | null;
  source: "you";
  epic_id?: string | null;
};

export type Actions = {
  offline: boolean; // no network: writes are held back
  away?: boolean; // the socket has been down a few seconds (reconnecting, or offline)
  unsaved: boolean;
  toast: ToastData | null;
  dismiss: () => void;
  add: (t: NewTask) => Promise<boolean>;
  tick: (id: string, done: boolean) => void;
  remove: (id: string) => void;
  save: (id: string, patch: Record<string, unknown>) => Promise<boolean>;
  // A block for the task: blockId moves that one; without it the task gets another block that day.
  place: (id: string, date: string, start: number, mins: number, blockId?: string) => void;
  // One block (blockId), or all the task's blocks that day.
  unplace: (id: string, date: string, blockId?: string) => void;
  addAndPlace: (t: NewTask, date: string, start: number, mins: number) => Promise<boolean>;
  reorder: (id: string, sortOrder: number) => void;
  // A change dragged into being (to another rail), with Undo putting the old values back.
  shift: (id: string, patch: Record<string, unknown>, message: string) => void;
  planTasks: (ids: string[], date: string) => Promise<void>;
  // Auto plan: fill a day's window around what's there (see fillDay). Undo puts the day back as it was.
  autoPlan: (o: AutoPlanOptions) => Promise<void>;
  // The same, proposed only: what it would put where, for the preview on the line. null when it couldn't ask.
  previewPlan: (o: AutoPlanOptions) => Promise<PlanPreview | null>;
  // Replan from now: today's passed, unticked blocks off, the rest of today refilled, what won't fit onto tomorrow.
  replan: (o: AutoPlanOptions) => Promise<void>;
  // A prep task for a calendar event (due that day, 15m); asked again, it finds the first.
  prep: (e: PrepEvent) => Promise<void>;
};

export type AutoPlanOptions = {
  date: string; from: string; until: string; keep: boolean;
  lunch: boolean; buffer: number; slack: boolean; // lunch 12–1 kept free; minutes free after meetings; fill only what gets done
  seed?: number; // Shuffle
};
export type PlanPreview = {
  proposed: { task_id: string; title: string; start: string; mins: number; why: string }[];
  free_mins: number; slack_mins: number; from: string; until: string;
};

export type PrepEvent = { date: string; start?: string; end?: string; title: string; where?: string };

const failure = (e: unknown, fallback: string) => {
  const data = (e as { data?: unknown })?.data;
  const msg = typeof data === "object" && data && "message" in data ? String((data as { message: unknown }).message) : "";
  return msg ? `${fallback}: ${msg}` : fallback;
};

// Every write the board makes: optimistic through Convex, with one toast at a time (Undo, or an error).
export function useActions(board: BoardData): Actions {
  const [toast, setToast] = useState<ToastData | null>(null);
  const seq = useRef(0);
  const show = useCallback((t: Omit<ToastData, "id">) => setToast({ ...t, id: ++seq.current }), []);
  const dismiss = useCallback(() => setToast(null), []);
  const live = useRef(board);
  live.current = board;
  // Offline, every new write is a quiet no-op (the UI disables its controls; this is the backstop).
  // Undo is never gated: Convex queues it behind the write it reverses, and `unsaved` shows the queue.
  // Writes wait only when there is no network; a socket coming back after the app was away just queues them.
  const offline = useNoNetwork();
  const away = useOffline(); // the socket has been down a while: shown as a stamp, and with writes waiting, "unsaved"
  const unsaved = useConvexConnectionState().hasInflightRequests && away;
  const open = useRef(!offline);
  open.current = !offline;
  const gate = useCallback(<A extends unknown[], R>(fn: (...a: A) => R, off: R) => (...a: A): R => (open.current ? fn(...a) : off), []);

  const addTasks = useMutation(api.agent.addTasks).withOptimisticUpdate((s, a) => opt.addTasks(s as Store, a));
  const updateTask = useMutation(api.agent.updateTask).withOptimisticUpdate((s, a) => opt.updateTask(s as Store, a));
  const deleteTask = useMutation(api.agent.deleteTask).withOptimisticUpdate((s, a) => opt.deleteTask(s as Store, a));
  const placeBlock = useMutation(api.agent.placeBlock).withOptimisticUpdate((s, a) => opt.placeBlock(s as Store, a));
  const removeBlock = useMutation(api.agent.removeBlock).withOptimisticUpdate((s, a) => opt.removeBlock(s as Store, a));
  const planDay = useMutation(api.agent.plan);
  const fillPlan = useMutation(api.agent.fillPlan);
  const replanDay = useMutation(api.agent.replan);
  const prepTask = useMutation(api.agent.prepTask);

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
      const blocks = b.blocks.filter((x) => x.task_id === id);
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
              await updateTask({ id: created, patch: t.done ? { sort_order: t.sort_order, done: true, done_on: t.done_on } : { sort_order: t.sort_order } });
              for (const x of blocks) await placeBlock({ task_id: created, date: x.date, start: x.start, mins: x.mins });
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

  // Callers clamp (lib/timeline.ts); the server clamps again. Undo puts a moved block back where it was, or takes a
  // new one off again.
  const place = useCallback(
    (id: string, date: string, start: number, mins: number, blockId?: string) => {
      if (isOptimistic(id) || (blockId && isOptimistic(blockId))) return;
      const b = live.current;
      const t = b.tasks.find((x) => x.id === id);
      const prev = blockId ? b.blocks.find((x) => x.id === blockId) : undefined;
      const saved = placeBlock({ task_id: id, date, start: toHM(start), mins, ...(prev ? { block_id: blockId } : {}) });
      show({
        kind: "undo", message: `${prev ? "Moved" : "Planned"}: ${t?.title ?? "task"}`,
        undo: () => {
          const back = prev
            ? placeBlock({ task_id: id, date: prev.date, start: prev.start, mins: prev.mins, block_id: blockId })
            : saved.then((r) => removeBlock({ task_id: id, date, block_id: (r as { id: string }).id }));
          void back.catch((e) => fail("Couldn't undo", e));
        },
      });
      saved.catch((e) => fail("Couldn't plan that", e));
    },
    [placeBlock, removeBlock, show, fail],
  );

  const unplace = useCallback(
    (id: string, date: string, blockId?: string) => {
      const b = live.current;
      const gone = b.blocks.filter((x) => (blockId ? x.id === blockId : x.task_id === id && x.date === date));
      if (!gone.length || isOptimistic(id)) return;
      const t = b.tasks.find((x) => x.id === id);
      show({
        kind: "undo", message: `Unplanned: ${t?.title ?? "task"}`,
        undo: () => void (async () => {
          for (const x of gone) await placeBlock({ task_id: id, date: x.date, start: x.start, mins: x.mins });
        })().catch((e) => fail("Couldn't undo", e)),
      });
      removeBlock({ task_id: id, date, ...(blockId ? { block_id: blockId } : {}) }).catch((e) => fail("Couldn't unplan that", e));
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
        show({
          kind: "undo", message: `Planned: ${t.title}`,
          undo: () => void (async () => {
            await removeBlock({ task_id: id, date });
            await deleteTask({ id });
          })().catch((e) => fail("Couldn't undo", e)),
        });
        return true;
      } catch (e) {
        fail("Couldn't plan that", e);
        return false;
      }
    },
    [addTasks, placeBlock, removeBlock, deleteTask, show, fail],
  );

  // A drop in a rail: only sort_order changes.
  const reorder = useCallback(
    (id: string, sortOrder: number) => {
      if (isOptimistic(id)) return;
      updateTask({ id, patch: { sort_order: sortOrder } }).catch((e) => fail("Couldn't move that", e));
    },
    [updateTask, fail],
  );

  const shift = useCallback(
    (id: string, patch: Record<string, unknown>, message: string) => {
      if (isOptimistic(id)) return;
      const t = live.current.tasks.find((x) => x.id === id);
      if (!t) return;
      const before = Object.fromEntries(Object.keys(patch).map((k) => [k, (t as unknown as Record<string, unknown>)[k] ?? null]));
      if ("done" in patch) before.done_on = t.done_on;
      show({ kind: "undo", message, undo: () => void updateTask({ id, patch: before }).catch((e) => fail("Couldn't undo", e)) });
      updateTask({ id, patch }).catch((e) => fail("Couldn't move that", e));
    },
    [updateTask, show, fail],
  );

  // The server's auto-plan puts these into the first free gaps. Undo removes whatever it placed.
  const planTasks = useCallback(
    async (ids: string[], date: string) => {
      const real = ids.filter((id) => !isOptimistic(id));
      if (!real.length) return;
      try {
        const r = (await planDay({ date, task_ids: real, commit: true, now: Date.now() })) as {
          proposed: { id?: string; task_id: string; title: string; start: string }[];
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
          // Planning only ever adds blocks: Undo takes just those off again.
          undo: () =>
            void (async () => {
              for (const p of placed) {
                await removeBlock({ task_id: p.task_id, date, ...(p.id ? { block_id: p.id } : {}) });
              }
            })().catch((e) => fail("Couldn't undo", e)),
        });
      } catch (e) {
        fail("Couldn't plan that", e);
      }
    },
    [planDay, removeBlock, show, fail],
  );

  const ask = (o: AutoPlanOptions) => ({
    date: o.date, from: o.from, until: o.until, keep: o.keep, lunch: o.lunch, buffer: o.buffer, slack: o.slack,
    ...(o.seed ? { seed: o.seed } : {}), now: Date.now(),
  });
  const autoPlan = useCallback(
    async (o: AutoPlanOptions) => {
      try {
        const r = await fillPlan({ ...ask(o), commit: true });
        const day = o.date === board.today ? "" : ` for ${dayWord(o.date, board.today)}`;
        if (!r.proposed.length) {
          show({ kind: "error", message: r.free_mins ? `Nothing left to plan${day}` : `No free time${day} between ${clock12(r.from)} and ${clock12(r.until)}` });
          return;
        }
        const slack = r.slack_mins >= 15 ? `, ${formatDuration(r.slack_mins)} left as slack` : r.free_mins >= 15 ? `, ${formatDuration(r.free_mins)} still free` : "";
        show({
          kind: "undo",
          message: `Planned ${r.proposed.length}${day}${slack}`,
          // Back as it was: the new blocks off, the replaced ones back on.
          undo: () =>
            void (async () => {
              for (const p of r.proposed) await removeBlock({ task_id: p.task_id, date: o.date, ...("id" in p ? { block_id: p.id as string } : {}) });
              for (const b of r.replaced) await placeBlock({ task_id: b.task_id, date: o.date, start: b.start, mins: b.mins });
            })().catch((e) => fail("Couldn't undo", e)),
        });
      } catch (e) {
        fail("Couldn't auto plan", e);
      }
    },
    [fillPlan, removeBlock, placeBlock, board.today, show, fail], // eslint-disable-line react-hooks/exhaustive-deps -- ask is pure
  );

  const previewPlan = useCallback(
    async (o: AutoPlanOptions): Promise<PlanPreview | null> => {
      try {
        return await fillPlan({ ...ask(o), commit: false });
      } catch (e) {
        fail("Couldn't auto plan", e);
        return null;
      }
    },
    [fillPlan, fail], // eslint-disable-line react-hooks/exhaustive-deps -- ask is pure
  );

  const replan = useCallback(
    async (o: AutoPlanOptions) => {
      try {
        const r = await replanDay({ ...ask(o), commit: true });
        const moved = r.tomorrow.length ? `, ${r.tomorrow.length} moved to tomorrow` : "";
        if (!r.proposed.length && !r.tomorrow.length && !r.removed.length) {
          show({ kind: "error", message: "Nothing to replan: no missed blocks and nothing left to fit" });
          return;
        }
        show({
          kind: "undo",
          message: `Replanned: ${r.proposed.length} for the rest of today${moved}`,
          undo: () =>
            void (async () => {
              for (const p of r.proposed) await removeBlock({ task_id: p.task_id, date: board.today, ...("id" in p ? { block_id: p.id as string } : {}) });
              for (const p of r.tomorrow as unknown as { task_id: string; date: string; id: string }[]) await removeBlock({ task_id: p.task_id, date: p.date, block_id: p.id });
              for (const b of r.removed) await placeBlock({ task_id: b.task_id, date: board.today, start: b.start, mins: b.mins });
            })().catch((e) => fail("Couldn't undo", e)),
        });
      } catch (e) {
        fail("Couldn't replan", e);
      }
    },
    [replanDay, removeBlock, placeBlock, board.today, show, fail], // eslint-disable-line react-hooks/exhaustive-deps -- ask is pure
  );

  const prep = useCallback(
    async (e: PrepEvent) => {
      try {
        const r = await prepTask(e);
        if (!r.created) return show({ kind: "error", message: `Already on the list: ${r.title}` });
        show({
          kind: "undo", message: `Added: ${r.title}`,
          undo: () => void deleteTask({ id: r.id }).catch((err) => fail("Couldn't undo", err)),
        });
      } catch (err) {
        fail("Couldn't add that", err);
      }
    },
    [prepTask, deleteTask, show, fail],
  );

  return {
    offline, unsaved, away, toast, dismiss, prep: gate(prep, Promise.resolve()),
    add: gate(add, Promise.resolve(false)), tick: gate(tick, undefined), remove: gate(remove, undefined),
    save: gate(save, Promise.resolve(false)), place: gate(place, undefined), unplace: gate(unplace, undefined),
    addAndPlace: gate(addAndPlace, Promise.resolve(false)), reorder: gate(reorder, undefined), shift: gate(shift, undefined),
    planTasks: gate(planTasks, Promise.resolve()), autoPlan: gate(autoPlan, Promise.resolve()),
    previewPlan: gate(previewPlan, Promise.resolve(null)), replan: gate(replan, Promise.resolve()),
  };
}
