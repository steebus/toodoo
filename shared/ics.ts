import ICAL from "ical.js";
import { addDays, hm, ymd } from "./planning.ts";

export interface FeedEvent { start: string; end: string; title: string; where?: string; allDay?: boolean }

const MAX_STEPS = 5000; // ponytail: per-series cap on recurrence steps; a daily series from years back still fits

// An iCal feed's events between from and until (YYYY-MM-DD, inclusive), by local date. Repeats are expanded,
// moved and cancelled occurrences honoured. A timed event that runs past midnight stays on its first day.
export function icsEvents(text: string, from: string, until: string): Record<string, FeedEvent[]> {
  const root = new ICAL.Component(ICAL.parse(text));
  for (const tz of root.getAllSubcomponents("vtimezone")) ICAL.TimezoneService.register(tz);
  const masters = new Map<string, ICAL.Event>();
  const loose: ICAL.Event[] = [];
  const exceptions: ICAL.Event[] = [];
  for (const v of root.getAllSubcomponents("vevent")) {
    const e = new ICAL.Event(v);
    if (e.isRecurrenceException()) exceptions.push(e);
    else if (e.isRecurring()) masters.set(e.uid, e);
    else loose.push(e);
  }
  for (const x of exceptions) {
    const m = masters.get(x.uid);
    if (m) m.relateException(x);
    else loose.push(x);
  }

  const out: Record<string, FeedEvent[]> = {};
  const stop = new Date(addDays(until, 2) + "T00:00:00Z").getTime();
  const add = (s: ICAL.Time, e: ICAL.Time | null, item: ICAL.Event) => {
    if (item.component.getFirstPropertyValue("status") === "CANCELLED") return;
    const title = (item.summary || "Busy").trim();
    const where = item.location?.split("\n")[0].trim().slice(0, 120) || undefined;
    if (s.isDate) {
      const first = s.toString();
      const last = e && e.compare(s) > 0 ? addDays(e.toString(), -1) : first; // DTEND is the day after
      for (let d = first; d <= last && d <= until; d = addDays(d, 1)) {
        if (d >= from) (out[d] ??= []).push({ start: "00:00", end: "23:59", title, ...(where && { where }), allDay: true });
      }
      return;
    }
    const sj = s.toJSDate();
    const d = ymd(sj);
    if (d < from || d > until) return;
    const ej = e?.toJSDate() ?? sj;
    const end = ymd(ej) > d ? "23:59" : hm(ej);
    (out[d] ??= []).push({ start: hm(sj), end, title, ...(where && { where }) });
  };

  for (const e of loose) add(e.startDate, e.endDate, e);
  for (const e of masters.values()) {
    const it = e.iterator();
    for (let t = it.next(), n = 0; t && n < MAX_STEPS; t = it.next(), n++) {
      if (t.toJSDate().getTime() > stop) break;
      const o = e.getOccurrenceDetails(t);
      add(o.startDate, o.endDate, o.item);
    }
  }
  for (const list of Object.values(out)) list.sort((a, b) => (a.allDay === b.allDay ? a.start.localeCompare(b.start) : a.allDay ? -1 : 1));
  return out;
}
