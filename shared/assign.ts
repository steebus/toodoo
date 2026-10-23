// Who a task is for. Everything is Steve's unless it is assigned to Claude; Claude has its own columns.

export const ASSIGNEES = ["steve", "claude"] as const;
export type Assignee = (typeof ASSIGNEES)[number];

// Claude's own board: To do, Doing, Escalated (stuck, needs Steve), Review (finished, Steve to check), Done.
// Done is also the task's own done flag.
export const CLAUDE_STATUSES = ["todo", "doing", "escalated", "review", "done"] as const;
export type ClaudeStatus = (typeof CLAUDE_STATUSES)[number];
export const CLAUDE_STATUS_LABEL: Record<ClaudeStatus, string> = {
  todo: "To do", doing: "Doing", escalated: "Escalated", review: "Review", done: "Done",
};

// The #claude tag that scheduled runs scan for. Assigning to Claude keeps it on, and nothing ever takes it off.
export const CLAUDE_TAG = "claude";

export const normAssignee = (v: unknown): Assignee | null => {
  const s = String(v ?? "").toLowerCase().replace(/^@/, "").trim();
  return s === "steve" || s === "me" ? "steve" : s === "claude" ? "claude" : null;
};
export const normClaudeStatus = (v: unknown): ClaudeStatus | null => {
  const s = String(v ?? "").toLowerCase().replace(/[^a-z]+/g, " ").trim();
  if (["todo", "to do", "open", "new", "queued"].includes(s)) return "todo";
  if (["doing", "in progress", "working", "started"].includes(s)) return "doing";
  if (["escalated", "escalate", "stuck", "blocked", "needs steve"].includes(s)) return "escalated";
  if (["review", "in review", "to review", "ready for review"].includes(s)) return "review";
  if (["done", "complete", "completed"].includes(s)) return "done";
  return null;
};

interface Assignable { assignee?: Assignee | null; claude_status?: ClaudeStatus | null; tags?: string[] }

// Assigned to Claude now. A task nobody has assigned, but that carries #claude, counts (the tag came first).
export const assignedToClaude = (t: Assignable) =>
  t.assignee === "claude" || (!t.assignee && !!t.tags?.includes(CLAUDE_TAG));

// On Claude's board: assigned to it, or still in its columns (in Review it is Steve's to check).
export const onClaudeBoard = (t: Assignable) => assignedToClaude(t) || !!t.claude_status;

// Its column on Claude's board.
export const claudeColumn = (t: Assignable & { done: boolean }): ClaudeStatus =>
  t.done ? "done" : t.claude_status && t.claude_status !== "done" ? t.claude_status : "todo";
