// The Suggested inbox: what the agent and the Jira link propose, before Steve takes it. Pure helpers, shared by the
// server (proposing, combining) and the web app (the "looks like" hints).
import type { Priority } from "./planning.ts";
import type { TaskStatus } from "./epics.ts";
import { normStatus } from "./validation.ts";

export type InboxState = "pending" | "accepted" | "rejected" | "merged";
export type Checklist = { text: string; done: boolean }[];

// The fields a suggestion carries over to a task.
export type Proposal = {
  title: string; description: string | null; note: string | null; link: string | null;
  source: string; external_id: string | null; due: string | null; time: string | null;
  priority: Priority | null; estimate_mins: number | null; tags: string[];
  epic_id: string | null; status?: TaskStatus; checklist?: Checklist;
  raised_at?: number; project?: string; // when and where the source made it (a Jira issue's created date and project)
};

// What a task looks like to the matcher and the combiner.
export type Mergeable = {
  title: string; description: string | null; note: string | null; link: string | null;
  source: string; external_id: string | null; due: string | null; time: string | null;
  priority: Priority | null; estimate_mins: number | null; tags: string[];
  epic_id?: string | null; checklist?: Checklist;
};

// ---------- looks like ----------

const STOP = new Set([
  "the", "and", "for", "with", "from", "into", "onto", "this", "that", "about", "re", "fw", "fwd", "to", "of", "on", "in",
  "a", "an", "at", "by", "or", "up", "do", "get", "make", "task", "todo", "please", "need", "needs",
]);
// Rough stems: enough that "review", "reviews" and "reviewing" meet.
const stem = (w: string) => w.replace(/(ing|ed|es|s)$/, "").replace(/(.)\1$/, "$1");
export const words = (s: string) =>
  new Set(s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 1 && !STOP.has(w)).map(stem).filter(Boolean));

// A Jira-style key anywhere in a string: ACME-293.
const KEYS = /\b[A-Z][A-Z0-9]{1,9}-\d+\b/g;
const keysIn = (...s: (string | null | undefined)[]) => new Set(s.flatMap((x) => (x ?? "").toUpperCase().match(KEYS) ?? []));

// How alike a suggestion and a task read, 0..1: the same external id or Jira key is a sure match; otherwise the
// Dice overlap of their title words, nudged up by shared description words.
export function likeness(a: Mergeable, b: Mergeable): number {
  if (a.external_id && a.external_id === b.external_id) return 1;
  const ka = keysIn(a.external_id, a.title, a.link), kb = keysIn(b.external_id, b.title, b.link, b.note);
  if ([...ka].some((k) => kb.has(k))) return 1;
  const ta = words(a.title), tb = words(b.title);
  if (!ta.size || !tb.size) return 0;
  const shared = [...ta].filter((w) => tb.has(w)).length;
  const dice = (2 * shared) / (ta.size + tb.size);
  // A title wholly inside the other ("Invoice" in "Send Acme invoice") counts for a lot.
  const contained = shared / Math.min(ta.size, tb.size);
  return Math.min(1, Math.max(dice, contained * 0.8));
}

export const LOOKALIKE = 0.45;

// The open tasks a suggestion most looks like, best first: what Combine offers before a search.
export function lookalikes<T extends Mergeable & { id: string }>(s: Mergeable, tasks: T[], n = 3) {
  return tasks
    .map((t) => ({ t, score: likeness(s, t) }))
    .filter((x) => x.score >= LOOKALIKE)
    .sort((x, y) => y.score - x.score)
    .slice(0, n)
    .map((x) => ({ id: x.t.id, title: x.t.title, score: Math.round(x.score * 100) / 100 }));
}

// ---------- combining ----------

const MAX_DESC = 2000;
const sameText = (a: string, b: string) => a.replace(/\s+/g, " ").trim().toLowerCase() === b.replace(/\s+/g, " ").trim().toLowerCase();

// What combining a suggestion into a task changes on the task. The task wins anything Steve set; the suggestion
// fills the gaps (description, link, due, priority, estimate, epic), adds its tags and checklist steps, and, when
// the task has no external id of its own, lends it the suggestion's so the next sync knows they're the same thing.
export function mergePatch(task: Mergeable, s: Mergeable): Partial<Mergeable> {
  const p: Partial<Mergeable> = {};
  if (s.description) {
    if (!task.description) p.description = s.description.slice(0, MAX_DESC);
    else if (!task.description.includes(s.description.trim()) && !sameText(task.description, s.description)) {
      p.description = `${task.description}\n\n${s.description}`.slice(0, MAX_DESC);
    }
  }
  if (!task.link && s.link) p.link = s.link;
  if (!task.note && s.note) p.note = s.note;
  if (!task.due && s.due) p.due = s.due;
  if (!task.time && s.time) p.time = s.time;
  if (!task.priority && s.priority) p.priority = s.priority;
  if (!task.estimate_mins && s.estimate_mins) p.estimate_mins = s.estimate_mins;
  if (!task.epic_id && s.epic_id) p.epic_id = s.epic_id;
  const tags = [...new Set([...task.tags, ...s.tags])].slice(0, 12);
  if (tags.length !== task.tags.length) p.tags = tags;
  const have = task.checklist ?? [];
  const extra = (s.checklist ?? []).filter((x) => !have.some((h) => sameText(h.text, x.text)));
  if (extra.length) p.checklist = [...have, ...extra].slice(0, 50);
  if (!task.external_id && s.external_id) { p.source = s.source; p.external_id = s.external_id; }
  return p;
}

// ---------- Jira ----------

export const DEFAULT_JQL = "assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC";

// "acme", "acme.atlassian.net" or "https://acme.atlassian.net/jira/..." → https://acme.atlassian.net
export function jiraSite(raw: string): string | null {
  const s = raw.trim().replace(/\/+$/, "");
  if (!s) return null;
  const host = /^[a-z0-9-]+$/i.test(s) ? `${s}.atlassian.net` : s.replace(/^https?:\/\//i, "").split(/[/?#]/)[0];
  return /^[a-z0-9-]+\.atlassian\.net$/i.test(host) ? `https://${host.toLowerCase()}` : null;
}

export const jiraPriority = (name?: string | null): Priority | null => {
  const s = (name ?? "").toLowerCase();
  if (s === "highest" || s === "high" || s === "critical" || s === "blocker") return "high";
  if (s === "medium") return "med";
  if (s === "low" || s === "lowest" || s === "minor" || s === "trivial") return "low";
  return null;
};

export const jiraStatus = (name?: string | null, category?: string | null): TaskStatus | undefined =>
  normStatus(name) ?? (category === "indeterminate" ? "doing" : category === "new" ? "todo" : undefined);

type Adf = { type?: string; text?: string; attrs?: Record<string, unknown>; content?: Adf[] };

// Atlassian Document Format to plain text, its task list items pulled out as checklist steps.
export function adfText(doc: unknown): { text: string; checklist: Checklist } {
  const checklist: Checklist = [];
  const block = new Set(["paragraph", "heading", "blockquote", "codeBlock", "rule", "panel", "table", "tableRow", "mediaGroup"]);
  const walk = (n: Adf, prefix = ""): string => {
    if (!n || typeof n !== "object") return "";
    if (n.type === "text") return n.text ?? "";
    if (n.type === "hardBreak") return "\n";
    if (n.type === "mention" || n.type === "emoji") return String(n.attrs?.text ?? "");
    if (n.type === "inlineCard") return String(n.attrs?.url ?? "");
    if (n.type === "taskItem") {
      const text = (n.content ?? []).map((c) => walk(c)).join("").trim();
      if (text) checklist.push({ text: text.slice(0, 200), done: n.attrs?.state === "DONE" });
      return "";
    }
    if (n.type === "listItem") return `${prefix}${(n.content ?? []).map((c) => walk(c)).join("").trim()}\n`;
    if (n.type === "bulletList") return (n.content ?? []).map((c) => walk(c, "- ")).join("");
    if (n.type === "orderedList") return (n.content ?? []).map((c, i) => walk(c, `${i + 1}. `)).join("");
    if (n.type === "tableCell" || n.type === "tableHeader") return (n.content ?? []).map((c) => walk(c)).join(" ").trim() + " | ";
    const inner = (n.content ?? []).map((c) => walk(c)).join("");
    return block.has(n.type ?? "") ? `${inner.trim()}\n` : inner;
  };
  const text = typeof doc === "string" ? doc : walk(doc as Adf);
  return { text: text.replace(/\n{3,}/g, "\n\n").trim(), checklist: checklist.slice(0, 50) };
}

export type JiraIssue = {
  key: string;
  fields: {
    summary?: string; description?: unknown; duedate?: string | null; labels?: string[]; created?: string | null;
    priority?: { name?: string } | null;
    status?: { name?: string; statusCategory?: { key?: string } } | null;
    timeoriginalestimate?: number | null; timeestimate?: number | null; aggregatetimeoriginalestimate?: number | null;
    parent?: { key?: string; fields?: { summary?: string; issuetype?: { name?: string; hierarchyLevel?: number } } } | null;
    project?: { name?: string; key?: string } | null;
    issuetype?: { name?: string } | null;
  };
};

// One Jira issue as a suggestion. The epic comes back as names to look up (its parent epic, then its project),
// since toodoo's epics are its own.
export function fromJira(issue: JiraIssue, site: string): Omit<Proposal, "epic_id"> & { epic_names: string[] } {
  const f = issue.fields ?? {};
  const { text, checklist } = adfText(f.description);
  const secs = f.timeoriginalestimate ?? f.aggregatetimeoriginalestimate ?? f.timeestimate ?? null;
  const est = secs && secs > 0 ? Math.min(1440, Math.max(1, Math.round(secs / 60))) : null;
  const parent = f.parent?.fields;
  const parentIsEpic = parent && (parent.issuetype?.name === "Epic" || parent.issuetype?.hierarchyLevel === 1);
  const status = jiraStatus(f.status?.name, f.status?.statusCategory?.key);
  const raised = f.created ? Date.parse(f.created) : NaN;
  return {
    title: (f.summary?.trim() || issue.key).slice(0, 300),
    description: text ? text.slice(0, MAX_DESC) : null,
    note: f.project?.name ? `${f.project.name}${f.issuetype?.name ? ` · ${f.issuetype.name}` : ""}` : null,
    link: `${site}/browse/${encodeURIComponent(issue.key)}`,
    source: "jira",
    external_id: `jira:${issue.key}`,
    due: f.duedate && /^\d{4}-\d{2}-\d{2}$/.test(f.duedate) ? f.duedate : null,
    time: null,
    priority: jiraPriority(f.priority?.name),
    estimate_mins: est,
    tags: ["work"],
    ...(status ? { status } : {}),
    ...(checklist.length ? { checklist } : {}),
    ...(Number.isFinite(raised) ? { raised_at: raised } : {}),
    ...(f.project?.name ? { project: f.project.name.slice(0, 120) } : {}),
    epic_names: [parentIsEpic ? parent?.summary : undefined, f.project?.name].filter((x): x is string => !!x),
  };
}

// A Bitbucket Cloud pull request as the API lists it (pullrequests?q=reviewers.uuid=...).
export type BitbucketPR = {
  id: number; title?: string; description?: string | null; created_on?: string | null;
  author?: { display_name?: string } | null;
  destination?: { repository?: { name?: string; full_name?: string } | null } | null;
  links?: { html?: { href?: string } | null } | null;
};

// One open PR waiting on me as a suggestion: who posted it in the note, the repository as its project, and the
// project (then repository) name as the epic to look up.
export function fromBitbucket(pr: BitbucketPR, projectName?: string | null): Omit<Proposal, "epic_id"> & { epic_names: string[] } {
  const repo = pr.destination?.repository;
  const full = repo?.full_name ?? String(pr.id);
  const raised = pr.created_on ? Date.parse(pr.created_on) : NaN;
  const by = pr.author?.display_name?.trim();
  const desc = pr.description?.trim();
  return {
    title: `Review: ${(pr.title?.trim() || `PR ${pr.id}`).slice(0, 280)}`,
    description: desc ? desc.slice(0, MAX_DESC) : null,
    note: [by && `From ${by}`, repo?.name].filter(Boolean).join(" · ") || null,
    link: pr.links?.html?.href ?? null,
    source: "bitbucket",
    external_id: `bitbucket:${full}#${pr.id}`,
    due: null, time: null, priority: null, estimate_mins: null,
    tags: ["work", "review"],
    ...(Number.isFinite(raised) ? { raised_at: raised } : {}),
    ...(projectName || repo?.name ? { project: (projectName || repo?.name)!.slice(0, 120) } : {}),
    epic_names: [projectName, repo?.name].filter((x): x is string => !!x),
  };
}

// ---------- prep for an event ----------

// A task's meeting: the one it is prep for. Events have no ids of their own (the calendar feed rewrites them), so
// the meeting is named by its day, start and title.
export type PrepLink = { date: string; start: string | null; title: string };
export const prepLink = (date: string, e: { start?: string; title?: string; allDay?: boolean }): PrepLink =>
  ({ date, start: e.allDay ? null : e.start ?? null, title: (e.title || "Untitled").trim().slice(0, 300) });
const sameTitle = (a: string, b: string) => a.replace(/\s+/g, " ").trim().toLowerCase() === b.replace(/\s+/g, " ").trim().toLowerCase();
// Whether a link means this event on this day: the same title, at the same start, or at any start when the meeting
// was moved and is the only one of that name that day.
export function linksTo(link: PrepLink, date: string, e: { start?: string; title?: string; allDay?: boolean }, day: { title?: string }[]) {
  if (link.date !== date || !sameTitle(link.title, e.title || "Untitled")) return false;
  if (link.start === (e.allDay ? null : e.start ?? null)) return true;
  return day.filter((x) => sameTitle(link.title, x.title || "Untitled")).length === 1;
}
// The tasks that are prep for an event, from any list of tasks.
export const prepsOf = <T extends { prep_for?: PrepLink | null }>(tasks: T[], date: string, e: { start?: string; title?: string; allDay?: boolean }, day: { start?: string; title?: string }[]) =>
  tasks.filter((t) => t.prep_for && linksTo(t.prep_for, date, e, day));

const slug = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 60);

// A prep task for a calendar event: due the day of it, sized small, keyed so a second click finds the first.
export function prepFor(e: { date: string; start?: string; end?: string; title: string; where?: string }) {
  const title = (e.title || "Untitled").trim();
  return {
    title: `Prep: ${title}`.slice(0, 300),
    source: "calendar",
    external_id: `prep:${e.date}:${e.start ?? "allday"}:${slug(title)}`,
    due: e.date,
    note: [e.start && `${e.start}${e.end ? `–${e.end}` : ""}`, e.where].filter(Boolean).join(" · ").slice(0, 500) || null,
    estimate_mins: 15,
    tags: ["prep"],
    prep_for: prepLink(e.date, e),
  };
}
