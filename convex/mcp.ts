import { ConvexError } from "convex/values";
import { EPIC_COLOURS } from "../shared/epics.ts";

const date = { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" };
const hm = { type: "string", pattern: "^\\d{1,2}:\\d{2}$" };
const obj = (properties: Record<string, unknown>, required: string[] = []) =>
  ({ type: "object", properties, required, additionalProperties: false });

export const TOOL_DEFS = [
  { name: "get_snapshot", annotations: { readOnlyHint: true },
    description: "Start here. jira_link (true: Jira issues reach Suggested by themselves, never gather Jira), suggested_waiting (how many suggestions wait in the inbox). Tasks (carried/due/upcoming/undated/done), the day's events+headline and next day's, week (events for the 3 days after), the day's plan, top suggestions, app_url. date defaults to today (Australia/Brisbane); query filters by text or #tag.",
    inputSchema: obj({ date, query: { type: "string", maxLength: 100 } }) },
  { name: "add_tasks",
    description: "Add tasks straight to Steve's list, when he asks you to (otherwise propose_tasks). One batch (max 100). Each: {title, source?, external_id?, due?, time? HH:MM, priority? high|med|low, estimate_mins? (number or '1h 30m'), tags?, link?, note?, description?, epic? (an epic's name) or epic_id?, status? backlog|todo|doing|blocked (also 'To Do', 'In Progress', 'On hold'), checklist? [text or {text, done}]}. Every fact goes in its own field: priority, status, epic, estimate, due and tags are never written into note or description. Existing source+external_id are skipped, never changed.",
    inputSchema: obj({ tasks: { type: "array", minItems: 1, maxItems: 100, items: { type: "object" } } }, ["tasks"]) },
  { name: "propose_tasks",
    description: "Suggest tasks for Steve to sort: they land in toodoo's Suggested inbox (he accepts, rejects or combines each with a task he already has), not on his list. Use this for anything you found yourself (email, calendar, messages, Jira when jira_link is false); use add_tasks only when Steve asks you to add something. Same fields as add_tasks; always set source + external_id so reruns refresh instead of repeating. Anything already a task, or already accepted, rejected or combined, is skipped.",
    inputSchema: obj({ tasks: { type: "array", minItems: 1, maxItems: 100, items: { type: "object" } } }, ["tasks"]) },
  { name: "update_task",
    description: "Patch one task by id: done (sets done_on), due, time, priority, estimate_mins, tags, title, note, description, link, epic (a name) or epic_id (null removes it from its epic), status backlog|todo|doing|blocked (the Kanban column; 'In Progress' etc. are understood), checklist [{text, done}] (replaces the whole list). Use the fields, never note, for priority, status and epic.",
    inputSchema: obj({ id: { type: "string" }, patch: { type: "object" } }, ["id", "patch"]) },
  { name: "set_day",
    description: "Upsert a day's headline and/or events [{start HH:MM, end HH:MM, title, where?, allDay?}]. Events replace the day's list, except when the user has a calendar feed: then events come only from it and are ignored here.",
    inputSchema: obj({ date, headline: { type: "string", maxLength: 500 }, events: { type: "array", maxItems: 100, items: { type: "object" } } }, ["date"]) },
  { name: "list_epics", annotations: { readOnlyHint: true },
    description: "Every epic: id, title, description, priority, status (planned|active|on_hold|done). A task's epic lifts or sinks it in suggest and plan: the epic's priority counts half as much as the task's own, and on_hold sinks it.",
    inputSchema: obj({}) },
  { name: "save_epic",
    description: "Create an epic ({title, description?, priority? high|med|low, status? planned|active|on_hold|done}), or patch one when id is given.",
    inputSchema: obj({
      id: { type: "string" }, title: { type: "string", maxLength: 120 }, description: { type: "string", maxLength: 2000 },
      priority: { type: ["string", "null"] }, status: { type: "string", enum: ["planned", "active", "on_hold", "done"] },
      colour: { type: "string", enum: [...EPIC_COLOURS] },
    }) },
  { name: "suggest", annotations: { readOnlyHint: true },
    description: "What to do next: ranked open tasks with reasons, plus next_free (today only).",
    inputSchema: obj({ date, limit: { type: "integer", minimum: 1, maximum: 20 } }) },
  { name: "plan",
    description: "Auto-plan time blocks between from and until (HH:MM) around events and existing blocks, using suggestions or task_ids. A task can have several blocks a day: listing a task (again), or one already on the line, adds another block; every block counts toward its estimate. Blocks run in 5-minute steps, 5m at least, and size to what's left of the estimate (else 30m, 1h for high), or to mins when given (split deep work around meetings). Small tasks listed together queue back to back (quick wins). Proposes only; saves when commit is true (returns each saved block's id).",
    inputSchema: obj({ date, task_ids: { type: "array", maxItems: 50, items: { type: "string" } }, from: hm, until: hm,
      mins: { type: "integer", minimum: 5, maximum: 240 }, commit: { type: "boolean" } }) },
  { name: "unplan", annotations: { destructiveHint: true },
    description: "Remove plan blocks for a date (all, or every block of just task_ids).",
    inputSchema: obj({ date, task_ids: { type: "array", maxItems: 50, items: { type: "string" } } }, ["date"]) },
];

const VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"];
type Msg = { jsonrpc?: string; id?: string | number | null; method?: unknown; params?: any };

// Stateless MCP over JSON-RPC: initialize, ping, tools/list, tools/call. Notifications get no response.
export async function handleRpc(msg: Msg, call: (name: string, args: unknown) => Promise<unknown>) {
  const id = msg?.id ?? null;
  const ok = (result: unknown) => ({ jsonrpc: "2.0", id, result });
  const fail = (code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });
  if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") return fail(-32600, "invalid request");
  if (msg.id === undefined) return null;
  switch (msg.method) {
    case "initialize": {
      const asked = msg.params?.protocolVersion;
      return ok({
        protocolVersion: VERSIONS.includes(asked) ? asked : VERSIONS[0],
        capabilities: { tools: {} },
        serverInfo: { name: "toodoo", version: "0.2.0" },
      });
    }
    case "ping": return ok({});
    case "tools/list": return ok({ tools: TOOL_DEFS });
    case "tools/call": {
      const name = msg.params?.name;
      if (!TOOL_DEFS.some((t) => t.name === name)) return fail(-32602, `unknown tool: ${name}`);
      try {
        return ok({ content: [{ type: "text", text: JSON.stringify(await call(name, msg.params?.arguments ?? {})) }] });
      } catch (e) {
        const message = e instanceof ConvexError
          ? (e.data as { message?: string })?.message ?? String(e.data)
          : e instanceof Error ? e.message : String(e);
        return ok({ content: [{ type: "text", text: JSON.stringify({ error: message }) }], isError: true });
      }
    }
    default: return fail(-32601, `method not found: ${msg.method}`);
  }
}
