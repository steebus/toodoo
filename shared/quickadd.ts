import { addDays, parseDuration } from "./planning.ts";
import { normTag } from "./validation.ts";

const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const FULL_DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const dow = (d: string) => new Date(d + "T12:00:00Z").getUTCDay();
const pad = (n: number) => String(n).padStart(2, "0");

type Chip = { kind: "date" | "time" | "priority" | "tag" | "estimate"; text: string };

export function parseQuickAdd(input: string, today: string, _nowM: number) {
  let due: string | null = null, time: string | null = null, priority: "high" | "med" | "low" | null = null;
  let estimate_mins: number | null = null;
  const tags: string[] = [];
  const chips: Chip[] = [];
  const keep: string[] = [];
  const words = input.trim().split(/\s+/).filter(Boolean);
  const year = today.slice(0, 4);
  for (let i = 0; i < words.length; i++) {
    const w = words[i], l = w.toLowerCase();
    let m: RegExpExecArray | null;
    if (!due && l === "today") { due = today; chips.push({ kind: "date", text: w }); continue; }
    if (!due && (l === "tomorrow" || l === "tmrw")) { due = addDays(today, 1); chips.push({ kind: "date", text: w }); continue; }
    if (!due && (DAYS.includes(l) || FULL_DAYS.includes(l))) {
      const target = DAYS.indexOf(l.slice(0, 3));
      const ahead = ((target - dow(today) + 7) % 7) || 7;
      due = addDays(today, ahead); chips.push({ kind: "date", text: w }); continue;
    }
    if (!due && /^\d{1,2}$/.test(w) && MONTHS.includes((words[i + 1] ?? "").toLowerCase().slice(0, 3))) {
      due = `${year}-${pad(MONTHS.indexOf(words[i + 1].toLowerCase().slice(0, 3)) + 1)}-${pad(+w)}`;
      chips.push({ kind: "date", text: `${w} ${words[i + 1]}` }); i++; continue;
    }
    if (!due && (m = /^(\d{1,2})\/(\d{1,2})$/.exec(w))) {
      due = `${year}-${pad(+m[2])}-${pad(+m[1])}`; chips.push({ kind: "date", text: w }); continue;
    }
    if (!time && (m = /^(\d{1,2})(?::(\d{2}))?(am|pm)$/i.exec(w))) {
      let h = +m[1] % 12; if (m[3].toLowerCase() === "pm") h += 12;
      time = `${pad(h)}:${m[2] ?? "00"}`; chips.push({ kind: "time", text: w }); continue;
    }
    if (!time && (m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(w))) {
      time = `${pad(+m[1])}:${m[2]}`; chips.push({ kind: "time", text: w }); continue;
    }
    if (!time && l === "at" && /^\d{1,2}$/.test(words[i + 1] ?? "")) {
      let h = +words[i + 1]; if (h >= 1 && h <= 6) h += 12; // ponytail: bare hours 1–6 mean pm (working hours)
      time = `${pad(h)}:00`; chips.push({ kind: "time", text: `at ${words[i + 1]}` }); i++; continue;
    }
    if (!priority && (m = /^!(high|med|medium|low)?$/i.exec(w))) {
      const v = (m[1] ?? "high").toLowerCase();
      priority = v === "medium" ? "med" : (v as "high" | "med" | "low"); chips.push({ kind: "priority", text: w }); continue;
    }
    if (/^#\S+$/.test(w)) {
      const t = normTag(w); if (t && !tags.includes(t)) { tags.push(t); chips.push({ kind: "tag", text: w }); }
      continue;
    }
    if (!estimate_mins && /^~\S+$/.test(w)) {
      const n = parseDuration(w.slice(1));
      if (typeof n === "number" && Number.isFinite(n) && n > 0) { estimate_mins = n; chips.push({ kind: "estimate", text: w }); continue; }
    }
    keep.push(w);
  }
  return { title: keep.join(" "), due, time, priority, tags, estimate_mins, chips };
}
