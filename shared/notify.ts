// Due-date reminders: when a task's notification fires and what it says. Pure, so the push round can be tested.
import { fmtTime, toMin } from "./planning.ts";

export const DEFAULT_REMIND_AT = "07:00"; // a task due on a day, with no time: the morning of
export const LEAD_CHOICES = [0, 5, 10, 15, 30, 60] as const; // a task with a time: this many minutes before it
export const MAX_WINDOW_MS = 60 * 60_000; // a round that missed hours sends the last hour's, not a backlog

export interface Prefs { remind_at: string; lead_mins: number }
export interface DueTask { id: string; title: string; due: string | null; time: string | null; done: boolean }
export interface Nudge { title: string; body: string; url: string; tag: string }

// ponytail: Brisbane has no daylight saving, so a fixed +10:00 (planning.ts's TZ); a zone library if that changes
const at = (date: string, hm: string) => Date.parse(`${date}T${hm.padStart(5, "0")}:00+10:00`);

// When a task's reminder fires (ms), or null when it has none (done, or no due date).
export function fireAt(t: DueTask, p: Prefs): number | null {
  if (t.done || !t.due) return null;
  if (t.time && toMin(t.time) != null) return at(t.due, t.time) - p.lead_mins * 60_000;
  return at(t.due, p.remind_at);
}

// The reminders a round owes: every task firing in (from, to]. The morning's undated-time tasks go out as one
// notification; each timed task as its own.
export function dueNudges(tasks: DueTask[], p: Prefs, from: number, to: number): Nudge[] {
  const lo = Math.max(from, to - MAX_WINDOW_MS);
  const firing = tasks.filter((t) => { const f = fireAt(t, p); return f !== null && f > lo && f <= to; });
  const timed = firing.filter((t) => t.time).sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));
  const morning = firing.filter((t) => !t.time);
  const out: Nudge[] = timed.map((t) => ({
    title: p.lead_mins ? `${t.title} · in ${p.lead_mins}m` : t.title,
    body: `Due ${fmtTime(t.time)}`,
    url: `/?date=${t.due}`,
    tag: `due-${t.id}`,
  }));
  const byDay = new Map<string, DueTask[]>();
  for (const t of morning) byDay.set(t.due!, [...(byDay.get(t.due!) ?? []), t]);
  for (const [day, list] of byDay) {
    out.push(list.length === 1
      ? { title: list[0].title, body: "Due today", url: `/?date=${day}`, tag: `due-${list[0].id}` }
      : { title: `${list.length} tasks due today`, body: list.slice(0, 6).map((t) => `• ${t.title}`).join("\n") + (list.length > 6 ? `\n+${list.length - 6} more` : ""), url: `/?date=${day}`, tag: `due-${day}` });
  }
  return out;
}

// "07:00", "7:30" → "HH:MM"; null when not a time of day.
export function normTime(s: string): string | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m || +m[1] > 23 || +m[2] > 59) return null;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}
