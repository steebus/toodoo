import { epicWords } from "./epics.ts";
import { addDays, parseDuration } from "./planning.ts";
import { normTag } from "./validation.ts";

const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const FULL_DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTH_WORDS = new Map<string, number>([
  ["jan", 1], ["january", 1], ["feb", 2], ["february", 2], ["mar", 3], ["march", 3],
  ["apr", 4], ["april", 4], ["may", 5], ["jun", 6], ["june", 6], ["jul", 7], ["july", 7],
  ["aug", 8], ["august", 8], ["sep", 9], ["sept", 9], ["september", 9], ["oct", 10], ["october", 10],
  ["nov", 11], ["november", 11], ["dec", 12], ["december", 12],
]);
const dow = (d: string) => new Date(d + "T12:00:00Z").getUTCDay();
const pad = (n: number) => String(n).padStart(2, "0");
const isRealDate = (d: string) => new Date(d + "T00:00:00Z").toJSON()?.slice(0, 10) === d;

// A day+month is this year's, unless that has already passed: then next year. Null when not a real date.
const dayMonth = (day: number, mon: number, year: string, today: string): string | null => {
  const pick = (y: number) => {
    const d = `${y}-${pad(mon)}-${pad(day)}`;
    return isRealDate(d) ? d : null;
  };
  const d = pick(+year);
  if (!d || d >= today) return d;
  return pick(+year + 1);
};

type Chip = { kind: "date" | "time" | "priority" | "tag" | "estimate" | "epic"; text: string };
type EpicRef = { id: string; title: string; status?: string };

// "+launch" or "+web-re" picks the open epic whose title, or one of its words, starts that way.
export function epicFor(word: string, epics: EpicRef[]): EpicRef | null {
  const q = word.toLowerCase().replace(/[-_]+/g, " ").trim();
  if (!q) return null;
  const open = epics.filter((e) => e.status !== "done");
  return open.find((e) => e.title.toLowerCase().startsWith(q))
    ?? open.find((e) => epicWords(e.title).some((w) => w.startsWith(q)))
    ?? null;
}

export const QUICKADD_HINT = "Add: tomorrow 3pm !high ~45m #tag +epic";

export function parseQuickAdd(input: string, today: string, _nowM: number, epics: EpicRef[] = []) {
  let epic_id: string | null = null;
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
    // "at" before a time / "on" before a date: absorbed into the chip when it directly precedes the token.
    const lead = (word: string) => {
      const last = keep[keep.length - 1];
      if (last !== undefined && last === words[i - 1] && last.toLowerCase() === word) { keep.pop(); return last + " "; }
      return "";
    };
    const setDate = (value: string, text: string) => { due = value; chips.push({ kind: "date", text: lead("on") + text }); };
    if (!due && l === "today") { setDate(today, w); continue; }
    if (!due && (l === "tomorrow" || l === "tmrw")) { setDate(addDays(today, 1), w); continue; }
    if (!due && (DAYS.includes(l) || FULL_DAYS.includes(l))) {
      const target = DAYS.indexOf(l.slice(0, 3));
      const ahead = ((target - dow(today) + 7) % 7) || 7;
      setDate(addDays(today, ahead), w); continue;
    }
    if (!due && /^\d{1,2}$/.test(w) && MONTH_WORDS.has((words[i + 1] ?? "").toLowerCase())) {
      const d = dayMonth(+w, MONTH_WORDS.get(words[i + 1].toLowerCase())!, year, today);
      if (d) { setDate(d, `${w} ${words[i + 1]}`); i++; continue; }
    }
    if (!due && (m = /^(\d{1,2})\/(\d{1,2})$/.exec(w))) {
      const d = dayMonth(+m[1], +m[2], year, today);
      if (d) { setDate(d, w); continue; }
    }
    if (!time && (m = /^(\d{1,2})(?::(\d{2}))?(am|pm)$/i.exec(w))) {
      const hour = +m[1], min = m[2] ?? "00";
      if (hour >= 1 && hour <= 12 && +min <= 59) {
        let h = hour % 12; if (m[3].toLowerCase() === "pm") h += 12;
        time = `${pad(h)}:${min}`; chips.push({ kind: "time", text: lead("at") + w }); continue;
      }
    }
    if (!time && (m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(w))) {
      time = `${pad(+m[1])}:${m[2]}`; chips.push({ kind: "time", text: lead("at") + w }); continue;
    }
    if (!time && l === "at" && /^\d{1,2}$/.test(words[i + 1] ?? "") && +words[i + 1] <= 23) {
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
    if (!epic_id && epics.length && /^\+\S+$/.test(w)) {
      const e = epicFor(w.slice(1), epics);
      if (e) { epic_id = e.id; chips.push({ kind: "epic", text: e.title }); continue; }
    }
    if (!estimate_mins && /^~\S+$/.test(w)) {
      const n = parseDuration(w.slice(1));
      if (typeof n === "number" && Number.isFinite(n) && n > 0) { estimate_mins = n; chips.push({ kind: "estimate", text: w }); continue; }
    }
    keep.push(w);
  }
  return { title: keep.join(" "), due, time, priority, tags, estimate_mins, epic_id, chips };
}
