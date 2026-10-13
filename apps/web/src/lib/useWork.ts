import { useCallback, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Epic } from "@shared/epics.ts";
import type { FullTask } from "@shared/snapshot.ts";
import type { NewTask, ToastData } from "./useActions";
import { useMinuteTick } from "./useBoard";
import { useOffline } from "./offline";
import { isOptimistic } from "./optimistic";
import * as w from "./workOptimistic";

export type { WorkData } from "./workOptimistic";

export function useWorkspace(): w.WorkData | undefined {
  const now = useMinuteTick();
  return useQuery(api.epics.workspace, { now });
}

export type EpicFields = Pick<Epic, "title" | "description" | "priority" | "status" | "colour">;
export type WorkTask = Omit<NewTask, "source"> & { epic_id?: string | null; status?: FullTask["status"]; sort_order?: number };

export type WorkActions = {
  offline: boolean;
  toast: ToastData | null;
  dismiss: () => void;
  // A patch to one task (a move between columns or epics, or a reorder), with Undo putting the old values back.
  move: (id: string, patch: Partial<FullTask>, message: string) => void;
  save: (id: string, patch: Record<string, unknown>) => Promise<boolean>;
  add: (t: WorkTask) => Promise<boolean>;
  remove: (id: string) => void;
  createEpic: (e: EpicFields) => Promise<boolean>;
  updateEpic: (id: string, patch: Partial<EpicFields & { sort_order: number }>, message?: string) => Promise<boolean>;
  removeEpic: (id: string) => void;
};

const failure = (e: unknown, fallback: string) => {
  const data = (e as { data?: unknown })?.data;
  const msg = typeof data === "object" && data && "message" in data ? String((data as { message: unknown }).message) : "";
  return msg ? `${fallback}: ${msg}` : fallback;
};

const without = <T extends object>(o: T, keys: string[]) =>
  Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)));

// Every write the Board and Epics screens make, optimistic, with one toast at a time (as on the day).
export function useWorkActions(work: w.WorkData | undefined): WorkActions {
  const [toast, setToast] = useState<ToastData | null>(null);
  const seq = useRef(0);
  const show = useCallback((t: Omit<ToastData, "id">) => setToast({ ...t, id: ++seq.current }), []);
  const dismiss = useCallback(() => setToast(null), []);
  const live = useRef(work);
  live.current = work;
  const offline = useOffline();
  const open = useRef(!offline);
  open.current = !offline;

  const updateTask = useMutation(api.agent.updateTask).withOptimisticUpdate((s, a) => w.updateTask(s as w.WorkStore, a));
  const addTasks = useMutation(api.agent.addTasks).withOptimisticUpdate((s, a) => w.addTasks(s as w.WorkStore, a));
  const deleteTask = useMutation(api.agent.deleteTask).withOptimisticUpdate((s, a) => w.deleteTask(s as w.WorkStore, a));
  const create = useMutation(api.epics.create).withOptimisticUpdate((s, a) => w.createEpic(s as w.WorkStore, a));
  const update = useMutation(api.epics.update).withOptimisticUpdate((s, a) => w.updateEpic(s as w.WorkStore, a));
  const removeE = useMutation(api.epics.remove).withOptimisticUpdate((s, a) => w.removeEpic(s as w.WorkStore, a));

  const fail = useCallback((what: string, e: unknown) => show({ kind: "error", message: failure(e, what) }), [show]);
  const task = (id: string) => live.current?.tasks.find((t) => t.id === id);

  const move = useCallback((id: string, patch: Partial<FullTask>, message: string) => {
    const t = task(id);
    if (!open.current || !t || isOptimistic(id)) return;
    const before = Object.fromEntries(Object.keys(patch).map((k) => [k, t[k as keyof FullTask] ?? null])) as Partial<FullTask>;
    // done_on follows done on the server; sending it back as-is keeps a reopened task's history right.
    if ("done" in patch) before.done_on = t.done_on;
    show({ kind: "undo", message, undo: () => void updateTask({ id, patch: before }).catch((e) => fail("Couldn't undo", e)) });
    updateTask({ id, patch }).catch((e) => fail("Couldn't move that", e));
  }, [updateTask, show, fail]);

  const save = useCallback(async (id: string, patch: Record<string, unknown>) => {
    if (!open.current || isOptimistic(id)) return false;
    try { await updateTask({ id, patch }); return true; } catch (e) { fail("Couldn't save that", e); return false; }
  }, [updateTask, fail]);

  const add = useCallback(async (t: WorkTask) => {
    if (!open.current) return false;
    try {
      const r = await addTasks({ tasks: [{ ...t, source: "you" }] });
      if (r.errors.length || !r.created.length) {
        show({ kind: "error", message: `Couldn't add that: ${r.errors[0]?.error ?? "nothing was created"}` });
        return false;
      }
      return true;
    } catch (e) { fail("Couldn't add that", e); return false; }
  }, [addTasks, show, fail]);

  // Undo brings the task back as it was, in its epic and column; its plan blocks don't come back.
  const remove = useCallback((id: string) => {
    const t = task(id);
    if (!open.current || !t || isOptimistic(id)) return;
    show({
      kind: "undo", message: `Deleted: ${t.title}`,
      undo: () => void (async () => {
        const r = await addTasks({ tasks: [without(t, ["id", "done", "done_on", "sort_order"])] });
        const made = r.created[0]?.id;
        if (!made) return show({ kind: "error", message: `Couldn't undo: ${r.errors[0]?.error ?? "nothing was created"}` });
        await updateTask({ id: made, patch: t.done ? { sort_order: t.sort_order, done: true, done_on: t.done_on } : { sort_order: t.sort_order } });
      })().catch((e) => fail("Couldn't undo", e)),
    });
    deleteTask({ id }).catch((e) => fail("Couldn't delete that", e));
  }, [addTasks, updateTask, deleteTask, show, fail]);

  const createEpic = useCallback(async (e: EpicFields) => {
    if (!open.current) return false;
    try { await create({ epic: e }); return true; } catch (err) { fail("Couldn't make that epic", err); return false; }
  }, [create, fail]);

  const updateEpic = useCallback(async (id: string, patch: Partial<EpicFields & { sort_order: number }>, message?: string) => {
    const e = live.current?.epics.find((x) => x.id === id);
    if (!open.current || !e || isOptimistic(id)) return false;
    if (message) {
      const before = Object.fromEntries(Object.keys(patch).map((k) => [k, e[k as keyof Epic] ?? null]));
      show({ kind: "undo", message, undo: () => void update({ id, patch: before }).catch((err) => fail("Couldn't undo", err)) });
    }
    try { await update({ id, patch }); return true; } catch (err) { fail("Couldn't save that epic", err); return false; }
  }, [update, show, fail]);

  // Its tasks stay, unfiled. Undo makes the epic again and files them back under it.
  const removeEpic = useCallback((id: string) => {
    const e = live.current?.epics.find((x) => x.id === id);
    if (!open.current || !e || isOptimistic(id)) return;
    const filed = (live.current?.tasks ?? []).filter((t) => t.epic_id === id).map((t) => t.id);
    show({
      kind: "undo", message: `Deleted epic: ${e.title}`,
      undo: () => void (async () => {
        const made = await create({ epic: { title: e.title, description: e.description, priority: e.priority, status: e.status, colour: e.colour } });
        await update({ id: made.id, patch: { sort_order: e.sort_order } });
        for (const t of filed) await updateTask({ id: t, patch: { epic_id: made.id } });
      })().catch((err) => fail("Couldn't undo", err)),
    });
    removeE({ id }).catch((err) => fail("Couldn't delete that epic", err));
  }, [create, update, removeE, updateTask, show, fail]);

  return { offline, toast, dismiss, move, save, add, remove, createEpic, updateEpic, removeEpic };
}
