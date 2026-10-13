import { toMin } from "@shared/planning.ts";

// 24h "HH:MM" as the comp prints it: 12-hour clock, no am/pm.
export function clock12(hm: string | null | undefined): string {
  const n = toMin(hm);
  if (n == null) return "";
  const h = Math.floor(n / 60);
  return `${((h + 11) % 12) + 1}:${String(n % 60).padStart(2, "0")}`;
}

export function hourLabel(h: number): string {
  const h24 = h % 24;
  return `${((h24 + 11) % 12) + 1}${h24 >= 12 ? "pm" : "am"}`;
}

const dayParts = (d: string, opts: Intl.DateTimeFormatOptions) =>
  Object.fromEntries(
    new Intl.DateTimeFormat("en-AU", { timeZone: "UTC", ...opts })
      .formatToParts(new Date(d + "T12:00:00Z"))
      .map((p) => [p.type, p.value]),
  );

// "Monday 12 October"
export function longDate(d: string): string {
  const p = dayParts(d, { weekday: "long", day: "numeric", month: "long" });
  return `${p.weekday} ${p.day} ${p.month}`;
}

// "FRI  6 OCT"
export function shortDate(d: string): string {
  const p = dayParts(d, { weekday: "short", day: "numeric", month: "short" });
  return `${p.weekday} ${p.day} ${p.month}`.toUpperCase().replace(" ", "  ");
}

// Print title: upper case, broken greedily onto at most `lines` lines (the last one takes any overflow).
export function wrapTitle(title: string, max = 15, lines = 2): string[] {
  const out: string[] = [];
  for (const w of title.toUpperCase().split(/\s+/).filter(Boolean)) {
    const last = out[out.length - 1];
    if (last !== undefined && (last.length + 1 + w.length <= max || out.length >= lines)) out[out.length - 1] = `${last} ${w}`;
    else out.push(w);
  }
  return out;
}
