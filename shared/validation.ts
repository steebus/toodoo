import { z } from "zod";
import { EPIC_COLOURS, EPIC_STATUSES, TASK_STATUSES, type TaskStatus } from "./epics.ts";
import { parseDuration, type Priority } from "./planning.ts";

// Client-input failure: safe to show the caller. Anything else is an internal error.
export class InputError extends Error {}

export const normTag = (s: string) =>
  s.trim().toLowerCase().replace(/^#+/, "").replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 30);
export const parseTags = (v: unknown): string[] => {
  const parts = Array.isArray(v) ? v.map(String) : String(v ?? "").split(/[,\s#]+/);
  return [...new Set(parts.map(normTag).filter(Boolean))].slice(0, 12);
};
export const normPriority = (v: unknown): Priority | null => {
  const s = String(v ?? "").toLowerCase().replace(/\s*priority$/, "").trim();
  if (s === "medium") return "med";
  return s === "high" || s === "med" || s === "low" ? s : null;
};
// null = no link, undefined = invalid link
export function normLink(v: unknown): string | null | undefined {
  const s = String(v ?? "").trim();
  if (!s) return null;
  try {
    const u = new URL(/^[a-z]+:\/\//i.test(s) ? s : "https://" + s);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : undefined;
  } catch {
    return undefined;
  }
}

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => new Date(s + "T00:00:00Z").toJSON()?.slice(0, 10) === s, "not a real date");
const hmStr = z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/, "time must be HH:MM (00:00-23:59)");
const text = (max: number) => z.string().trim().max(max).nullish().transform((v) => v || null);

const Fields = z.object({
  title: z.string().trim().min(1).max(300),
  description: text(2000),
  note: text(500),
  link: z.unknown().transform((v, ctx) => {
    const l = normLink(v);
    if (l === undefined) { ctx.addIssue({ code: "custom", message: "not a web address" }); return z.NEVER; }
    return l;
  }).optional(),
  due: dateStr.optional(),
  time: hmStr.nullish().transform((v) => (v ? v.padStart(5, "0") : null)),
  priority: z.unknown().transform(normPriority).optional(),
  estimate_mins: z.union([z.number(), z.string()]).nullish().transform((v, ctx) => {
    if (v == null || v === "") return null;
    const n = typeof v === "number" ? Math.round(v) : parseDuration(v);
    if (n == null || !Number.isFinite(n) || n < 1 || n > 1440) {
      ctx.addIssue({ code: "custom", message: "estimate must be 1–1440 minutes or like 1h 30m" });
      return z.NEVER;
    }
    return n;
  }),
  tags: z.unknown().transform(parseTags).optional(),
  // An epic's id, or null for none; the server checks it is this user's.
  epic_id: z.string().trim().max(64).nullish().transform((v) => v || null),
  status: z.enum(TASK_STATUSES).optional(),
  // Steps inside a task: up to 50, each a short line, ticked or not. Blank lines are dropped.
  checklist: z.array(z.union([
    z.object({ text: z.string().trim().max(200), done: z.boolean().optional() }),
    z.string().trim().max(200).transform((text) => ({ text, done: false })),
  ])).max(50).transform((a) => a.filter((x) => x.text).map((x) => ({ text: x.text, done: !!x.done }))).optional(),
});

export const TaskInput = Fields.extend({
  source: z.string().trim().toLowerCase().regex(/^[a-z0-9_-]{1,30}$/).optional(),
  external_id: z.string().trim().min(1).max(200).nullish(),
});
const strictPriority = z.unknown().transform((v, ctx) => {
  const p = normPriority(v);
  if (p === null && v != null && String(v).trim() !== "") {
    ctx.addIssue({ code: "custom", message: "priority must be high, med or low" });
    return z.NEVER;
  }
  return p;
});

export const TaskPatch = Fields.partial().extend({
  priority: strictPriority.optional(),
  done: z.boolean().optional(),
  done_on: dateStr.nullish(),
  sort_order: z.number().optional(),
});
const Event = z.object({
  start: hmStr.transform((v) => v.padStart(5, "0")).optional(),
  end: hmStr.transform((v) => v.padStart(5, "0")).optional(),
  title: z.string().trim().min(1).max(300),
  where: z.string().trim().max(300).optional(),
  allDay: z.boolean().optional(),
});
export const DayInput = z.object({
  date: dateStr,
  headline: z.string().trim().max(500).nullish(),
  events: z.array(Event).max(100).optional(),
});

export const issuesText = (e: z.ZodError) =>
  e.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ");
const defined = <T extends object>(o: T) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;

export interface AddResult {
  created: { id: string; title: string; source: string; external_id: string | null }[];
  skipped: { title: string; source: string; external_id: string }[];
  errors: { index: number; error: string }[];
}

export interface TaskRow {
  title: string; description: string | null; note: string | null; link: string | null;
  source: string; external_id: string | null; due: string; time: string | null;
  priority: Priority | null; estimate_mins: number | null; tags: string[];
  epic_id: string | null; status?: TaskStatus; checklist?: { text: string; done: boolean }[];
}

// Validates and normalises a batch; duplicates inside the batch are reported as skipped.
export function prepareTasks(inputs: unknown[], today: string) {
  const errors: AddResult["errors"] = [];
  const skipped: AddResult["skipped"] = [];
  const rows: (TaskRow & { index: number })[] = [];
  const seen = new Set<string>();
  inputs.forEach((raw, index) => {
    const r = TaskInput.safeParse(raw);
    if (!r.success) { errors.push({ index, error: issuesText(r.error) }); return; }
    const v = r.data;
    const source = v.source ?? "you";
    const external_id = v.external_id ?? null;
    if (external_id) {
      const k = source + "\u0000" + external_id;
      if (seen.has(k)) { skipped.push({ title: v.title, source, external_id }); return; }
      seen.add(k);
    }
    rows.push({
      index, title: v.title, description: v.description ?? null, note: v.note ?? null, link: v.link ?? null,
      source, external_id, due: v.due ?? today, time: v.time ?? null, priority: v.priority ?? null,
      estimate_mins: v.estimate_mins ?? null, tags: v.tags ?? [], epic_id: v.epic_id ?? null,
      ...(v.status ? { status: v.status } : {}),
      ...(v.checklist?.length ? { checklist: v.checklist } : {}),
    });
  });
  return { rows, skipped, errors };
}

export function preparePatch(patch: unknown, today: string): Record<string, unknown> {
  const r = TaskPatch.safeParse(patch);
  if (!r.success) throw new InputError(issuesText(r.error));
  const p: Record<string, unknown> = defined(r.data);
  if (p.done === true && !p.done_on) p.done_on = today;
  if (p.done === false) p.done_on = null;
  if (!Object.keys(p).length) throw new InputError("nothing to update");
  return p;
}

export function parseDay(input: unknown) {
  const r = DayInput.safeParse(input);
  if (!r.success) throw new InputError(issuesText(r.error));
  return defined(r.data) as z.infer<typeof DayInput>;
}

export const EpicInput = z.object({
  title: z.string().trim().min(1).max(120),
  description: text(2000),
  priority: strictPriority.optional(),
  status: z.enum(EPIC_STATUSES).optional(),
  colour: z.enum(EPIC_COLOURS).nullish(),
});
export const EpicPatch = EpicInput.partial().extend({ sort_order: z.number().optional() });

export function parseEpic(input: unknown) {
  const r = EpicInput.safeParse(input);
  if (!r.success) throw new InputError(issuesText(r.error));
  const v = r.data;
  return {
    title: v.title, description: v.description ?? null, priority: v.priority ?? null, status: v.status ?? "planned" as const,
    colour: v.colour,
  };
}

export function parseEpicPatch(patch: unknown) {
  const r = EpicPatch.safeParse(patch);
  if (!r.success) throw new InputError(issuesText(r.error));
  const p = defined(r.data);
  if (!Object.keys(p).length) throw new InputError("nothing to update");
  return p;
}
