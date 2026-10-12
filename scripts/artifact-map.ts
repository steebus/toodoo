import { normLink, normPriority, parseTags } from "../shared/validation.ts";

export interface ArtifactTask {
  title: string; due: string; description?: string | null; note?: string | null; link?: string | null; source?: string;
  time?: string | null; priority?: string | null; estimate?: number | null; tags?: string[]; tag?: string | null;
  done?: boolean; doneOn?: string | null; created?: string; order?: number;
}
type Doc<T> = { id: string; data: T };

export function derivedKey(t: ArtifactTask): string | null {
  const link = t.link ?? "";
  if (t.source === "jira") { const m = /\/browse\/([A-Z][A-Z0-9]+-\d+)/.exec(link); if (m) return `jira:${m[1]}`; }
  if (t.source === "email") {
    // Gmail web links carry the decimal thread id; the Gmail API (used by the agent) uses its hex form.
    const dec = /thread-f:(\d+)/.exec(link);
    if (dec) return `gmail:${BigInt(dec[1]).toString(16)}`;
    const m = /#[a-z]+\/([A-Za-z0-9]{10,})$/.exec(link);
    if (m) return `gmail:${m[1]}`;
  }
  return null;
}

// The agent minted date-prefixed ids, so one Jira issue can appear on several days: the newest doc keeps the
// derived key (so future agent runs dedupe against it); older copies keep artifact:<id>.
export function mapTasks(docs: Doc<ArtifactTask>[]) {
  const owner = new Map<string, { id: string; created: string }>();
  for (const d of docs) {
    const k = derivedKey(d.data);
    if (!k) continue;
    const cur = owner.get(k);
    if (!cur || (d.data.created ?? "") > cur.created) owner.set(k, { id: d.id, created: d.data.created ?? "" });
  }
  return docs.map(({ id, data: t }) => {
    const k = derivedKey(t);
    const created = t.created && !Number.isNaN(Date.parse(t.created)) ? t.created : new Date().toISOString();
    const tags = Array.isArray(t.tags) ? parseTags(t.tags) : t.tag ? parseTags(t.tag) : t.source === "jira" ? ["work"] : [];
    return {
      artifactId: id,
      row: {
        title: String(t.title || "Untitled").slice(0, 300),
        description: t.description?.slice(0, 2000) || null,
        note: t.note?.slice(0, 500) || null,
        link: normLink(t.link) ?? null,
        source: t.source || "you",
        external_id: k && owner.get(k)!.id === id ? k : `artifact:${id}`,
        due: t.due,
        time: t.time || null,
        priority: normPriority(t.priority),
        estimate_mins: t.estimate && t.estimate > 0 ? Math.min(1440, Math.round(t.estimate)) : null,
        tags,
        done: !!t.done,
        done_on: t.done ? t.doneOn ?? t.due : null,
        sort_order: typeof t.order === "number" ? t.order : Date.parse(created) / 1000,
        created_at: created,
      },
    };
  });
}

export function mapBlocks(
  plans: Doc<{ blocks?: { taskId: string; start: string; mins: number }[] }>[],
  keyOf: Map<string, { source: string; external_id: string }>,
) {
  const seen = new Set<string>();
  const dropped: { date: string; taskId: string; reason: "missing task" | "bad time" | "duplicate" }[] = [];
  const blocks = plans.flatMap((p) =>
    (p.data.blocks ?? []).flatMap((b) => {
      const taskId = String(b.taskId);
      const k = keyOf.get(taskId);
      const key = `${p.id}|${k?.source}|${k?.external_id}`;
      const reason = !k ? "missing task" : !/^\d{1,2}:\d{2}$/.test(b.start ?? "") ? "bad time" : seen.has(key) ? "duplicate" : null;
      if (reason) { dropped.push({ date: p.id, taskId, reason }); return []; }
      seen.add(key);
      return [{ date: p.id, source: k!.source, external_id: k!.external_id, start: b.start, mins: Math.min(1440, Math.max(15, Math.round(+b.mins || 30))) }];
    }),
  );
  return { blocks, dropped };
}

export function mapDays(days: Doc<{ headline?: string | null; events?: unknown[] }>[]) {
  return days.map((d) => ({ date: d.id, headline: d.data.headline ?? null, events: Array.isArray(d.data.events) ? d.data.events : [] }));
}
