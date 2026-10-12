// One-off import of the claude.ai planner artifact export into Convex via POST /api/import. Idempotent.
// Usage: node --env-file=.env.import --import tsx scripts/import-artifact.ts scripts/artifact-export
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { mapBlocks, mapDays, mapTasks } from "./artifact-map.ts";

const dir = process.argv[2];
const { CONVEX_SITE_URL, TOODOO_API_KEY } = process.env;
if (!dir || !CONVEX_SITE_URL || !TOODOO_API_KEY) {
  console.error("usage: needs <exportDir> and CONVEX_SITE_URL, TOODOO_API_KEY");
  process.exit(1);
}

async function load<T>(collection: string) {
  const path = join(dir, collection);
  const files = (await readdir(path).catch(() => [] as string[])).filter((f) => f.endsWith(".json"));
  return Promise.all(files.map(async (f) => {
    const raw = JSON.parse(await readFile(join(path, f), "utf8"));
    return { id: f.slice(0, -5), data: (raw.data ?? raw) as T };
  }));
}

const tasks = mapTasks(await load("tasks"));
const keyOf = new Map(tasks.map((t) => [t.artifactId, { source: t.row.source, external_id: t.row.external_id }]));
const { blocks, dropped } = mapBlocks(await load("plans"), keyOf);
const body = { tasks: tasks.map((t) => t.row), days: mapDays(await load("days")), blocks };
const res = await fetch(`${CONVEX_SITE_URL}/api/import`, {
  method: "POST",
  headers: { authorization: `Bearer ${TOODOO_API_KEY}`, "content-type": "application/json" },
  body: JSON.stringify(body),
});
const out = await res.json();
if (!res.ok) { console.error(res.status, out); process.exit(1); }
console.log(`${dropped.length} blocks dropped client-side`);
for (const d of dropped) console.log(`  ${d.date} ${d.taskId}: ${d.reason}`);
console.log(`imported ${out.tasks} tasks, ${out.days} days, ${out.blocks} plan blocks (${out.dropped} dropped)`);
