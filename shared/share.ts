// What arrives when something is shared to toodoo (Android's share sheet, the bookmarklet): a link, a page
// title and maybe some words. readShare turns it into a task to confirm, and says what it noticed. Pure.
import { epicWords, type Epic } from "./epics.ts";
import { addDays, formatDuration, parseDuration, type Priority } from "./planning.ts";
import { parseQuickAdd } from "./quickadd.ts";

export interface SharedIn { url?: string | null; title?: string | null; text?: string | null }
export interface SharedTask {
  title: string; description: string | null; link: string | null; source: string; external_id: string | null;
  due: string | null; time: string | null; priority: Priority | null; estimate_mins: number | null; tags: string[];
  epic_id: string | null;
}
export interface ShareRead { task: SharedTask; found: string[] }

const TRACKING = /^(utm_\w+|fbclid|gclid|mc_[ce]id|igshid|si|ref_src|atlOrigin)$/i;
export function cleanUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
    return u.toString();
  } catch {
    return null;
  }
}

const firstUrl = (s: string) => /https?:\/\/[^\s<>"')\]]+/i.exec(s)?.[0] ?? null;
const JIRA_KEY = /\b([A-Z][A-Z0-9]{1,9}-\d{1,6})\b/;

// "[ACME-12] Fix it - Jira" → "Fix it". Site names after a last " - ", " | " or " · " go, when short.
function stripSite(title: string): string {
  const t = title.replace(/\s+/g, " ").trim();
  const m = /^(.{8,}?)\s+[-|·–—]\s+([^-|·–—]{1,32})$/.exec(t);
  return m ? m[1].trim() : t;
}

function fromJira(url: URL | null, title: string, text: string) {
  const key = (url && (/\/browse\/([A-Z][A-Z0-9]{1,9}-\d+)/.exec(url.pathname)?.[1] ?? url.searchParams.get("selectedIssue")))
    || (url?.hostname.endsWith("atlassian.net") ? JIRA_KEY.exec(title)?.[1] ?? JIRA_KEY.exec(text)?.[1] : null);
  if (!key || !JIRA_KEY.test(key)) return null;
  const summary = stripSite(title.replace(/\s*-\s*Jira\s*$/i, "")).replace(/^\[[A-Z0-9-]+\]\s*/, "").replace(new RegExp(`^${key}:?\\s*`), "");
  return {
    title: `${key} ${summary && summary !== key ? summary : ""}`.trim(),
    source: "jira", external_id: `jira:${key}`, tags: ["work"],
    link: url ? `${url.origin}/browse/${key}` : null, found: `Jira ${key}`,
  };
}

function fromGmail(url: URL, title: string) {
  if (url.hostname !== "mail.google.com") return null;
  const id = /#[^/]+\/(?:[^/]+\/)*([A-Za-z0-9_-]{12,})$/.exec(url.hash)?.[1];
  // "Subject - someone@example.com - Gmail"
  const subject = title.replace(/\s+-\s+[^-]*@[^-]*\s+-\s+Gmail\s*$/i, "").replace(/\s+-\s+Gmail\s*$/i, "").trim();
  return { title: subject, source: "email", external_id: id ? `gmail:${id}` : null, tags: [] as string[], link: url.toString(), found: "Gmail" };
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const pad = (n: number) => String(n).padStart(2, "0");
const real = (d: string) => new Date(d + "T00:00:00Z").toJSON()?.slice(0, 10) === d;
// This year's, or last or next year's when that is nearer: a date a few weeks gone is overdue, not next year's.
const nearest = (day: number, mon: number, today: string) => {
  const y = +today.slice(0, 4);
  const days = (d: string) => Math.abs(new Date(d).getTime() - new Date(today).getTime());
  return [y - 1, y, y + 1].map((n) => `${n}-${pad(mon)}-${pad(day)}`).filter(real).sort((a, b) => days(a) - days(b))[0] ?? null;
};

// A deadline in running text: only where the words say it is one ("due Friday", "by 22 Oct", "deadline: 2026-11-03"),
// or an explicit date. A bare "Monday" in an email is too often about something else.
export function deadlineIn(text: string, today: string): { due: string; said: string } | null {
  const s = text.toLowerCase();
  const cue = String.raw`(?:due|by|before|deadline:?|until|no later than|eta:?)\s+(?:on\s+|this\s+|next\s+)?`;
  let m: RegExpExecArray | null;
  if ((m = new RegExp(`${cue}(today|tonight|eod|end of (?:the )?day)\\b`).exec(s))) return { due: today, said: m[0] };
  if ((m = new RegExp(`${cue}(tomorrow|tmrw)\\b`).exec(s))) return { due: addDays(today, 1), said: m[0] };
  if ((m = new RegExp(`${cue}(end of (?:the )?week|eow)\\b`).exec(s))) {
    const dow = new Date(today + "T12:00:00Z").getUTCDay();
    return { due: addDays(today, (5 - dow + 7) % 7), said: m[0] };
  }
  if ((m = new RegExp(`${cue}(${WEEKDAYS.map((d) => d.slice(0, 3) + `(?:${d.slice(3)})?`).join("|")})\\b`).exec(s))) {
    const target = WEEKDAYS.findIndex((d) => m![1].startsWith(d.slice(0, 3)));
    const dow = new Date(today + "T12:00:00Z").getUTCDay();
    return { due: addDays(today, ((target - dow + 7) % 7) || 7), said: m[0] };
  }
  if ((m = /\b(20\d\d)-(\d\d)-(\d\d)\b/.exec(s)) && real(m[0])) return { due: m[0], said: m[0] };
  const mon = String.raw`(${MONTHS.join("|")})[a-z]*\.?`;
  if ((m = new RegExp(String.raw`\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?${mon}`).exec(s))) {
    const d = nearest(+m[1], MONTHS.indexOf(m[2]) + 1, today);
    if (d) return { due: d, said: m[0] };
  }
  if ((m = new RegExp(String.raw`\b${mon}\s+(\d{1,2})(?:st|nd|rd|th)?\b`).exec(s))) {
    const d = nearest(+m[2], MONTHS.indexOf(m[1]) + 1, today);
    if (d) return { due: d, said: m[0] };
  }
  return null;
}

const HIGH = /\b(urgent(?:ly)?|asap|critical|blocker|blocking|highest|p[01]|sev[- ]?[12]|high priority|priority:?\s*high|immediately|time[- ]sensitive)\b|!!/i;
const LOW = /\b(low priority|priority:?\s*(?:low|lowest)|lowest|whenever|no rush|nice to have|someday|p[34]|when you get a chance)\b/i;
const MED = /\b(priority:?\s*(?:medium|med)|medium priority)\b/i;
export function priorityIn(text: string): { priority: Priority; said: string } | null {
  for (const [p, re] of [["high", HIGH], ["low", LOW], ["med", MED]] as const) {
    const m = re.exec(text);
    if (m) return { priority: p, said: m[0].toLowerCase() };
  }
  return null;
}

export function estimateIn(text: string): number | null {
  const m = /\b(?:estimate[ds]?:?|est\.?|takes?|about|around|~)\s*(\d+(?:\.\d+)?\s*(?:h|hr|hrs|hours?|m|mins?|minutes?)(?:\s*\d+\s*(?:m|mins?|minutes?))?)\b/i.exec(text)
    ?? /~(\d+(?:\.\d+)?(?:h|m))\b/i.exec(text);
  if (!m) return null;
  const n = parseDuration(m[1].replace(/\s+/g, ""));
  return typeof n === "number" && Number.isFinite(n) && n > 0 && n <= 1440 ? n : null;
}

// The open epic whose title words the share mentions most (at least half of them, and one at least).
export function epicIn(words: Set<string>, epics: Epic[]): Epic | null {
  let best: { e: Epic; score: number; hits: number } | null = null;
  for (const e of epics) {
    if (e.status === "done") continue;
    const ws = [...new Set(epicWords(e.title))];
    if (!ws.length) continue;
    const hits = ws.filter((w) => words.has(w)).length;
    const score = hits / ws.length;
    if (hits && score >= 0.5 && (!best || score > best.score || (score === best.score && hits > best.hits))) best = { e, score, hits };
  }
  return best?.e ?? null;
}

export function readShare(input: SharedIn, today: string, epics: Epic[] = []): ShareRead {
  const text = (input.text ?? "").trim();
  const rawUrl = input.url?.trim() || firstUrl(text) || "";
  const link = rawUrl ? cleanUrl(rawUrl) : null;
  const url = link ? new URL(link) : null;
  // Android often puts the link alone in the text: don't keep it twice.
  const body = text.replace(rawUrl, "").trim();
  const pageTitle = (input.title ?? "").trim();
  const found: string[] = [];

  const special = fromJira(url, pageTitle, body) ?? (url ? fromGmail(url, pageTitle) : null);
  if (special) found.push(special.found);
  const firstLine = body.split(/\n/)[0]?.trim() ?? "";
  let title = special?.title || stripSite(pageTitle) || (firstLine.length <= 140 ? firstLine : firstLine.slice(0, 137) + "…") || url?.hostname || "";
  const description = [body && body !== title ? body : ""].filter(Boolean).join("\n").slice(0, 2000) || null;

  // The title is short and written as a task: the quick add's words (tomorrow, 3pm, !high, ~45m, #tag) count there.
  const q = parseQuickAdd(title, today, 0);
  if (!special && (q.due || q.time || q.priority || q.estimate_mins || q.tags.length) && q.title) title = q.title;
  const clues = `${title}\n${body}`;
  const dl = q.due ? { due: q.due, said: q.chips.find((c) => c.kind === "date")!.text } : deadlineIn(clues, today);
  if (dl) found.push(`due ${dl.said}`);
  const pr = q.priority ? { priority: q.priority, said: q.chips.find((c) => c.kind === "priority")!.text } : priorityIn(clues);
  if (pr) found.push(`${pr.priority === "med" ? "medium" : pr.priority}: "${pr.said}"`);
  const est = q.estimate_mins ?? estimateIn(clues);
  if (est) found.push(`~${formatDuration(est)}`);
  if (q.time) found.push(`at ${q.time}`);

  const words = new Set(epicWords(`${title} ${body} ${special?.external_id ?? ""}`));
  const epic = epicIn(words, epics);
  if (epic) found.push(`epic ${epic.title}`);

  return {
    task: {
      title: title.slice(0, 300), description, link, source: special?.source ?? "you", external_id: special?.external_id ?? null,
      due: dl?.due ?? null, time: q.time, priority: pr?.priority ?? null, estimate_mins: est,
      tags: [...new Set([...(special?.tags ?? []), ...q.tags])], epic_id: epic?.id ?? null,
    },
    found,
  };
}
