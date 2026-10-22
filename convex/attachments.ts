import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { requireUser } from "./lib/user";
import * as m from "./model";
import { ATTACH_MAX_BYTES as MAX_BYTES, ATTACH_MAX_FILES as MAX_FILES } from "../shared/attachments.ts";

// Files on a task. The browser asks for an upload address, posts the file there, then hands the stored file's id to
// add (or replace), which checks it and files it on the task. An upload that can't be filed is deleted, never left
// loose: so those refusals come back as { error } rather than thrown (a throw would roll the delete back).

const fail = (message: string, code = "input"): never => { throw new ConvexError({ code, message }); };
const cleanName = (s: string) => s.replace(/[\u0000-\u001f\\/]+/g, " ").trim().slice(0, 200);
const cleanType = (s?: string | null) => (s && /^[\w.+-]+\/[\w.+-]+$/.test(s) ? s.toLowerCase() : null);

const row = (a: Doc<"attachments">, url: string | null) => ({
  id: a._id as string, name: a.name, type: a.type, size: a.size, created_at: a.created_at, url,
});

async function owned(ctx: MutationCtx, userId: string, id: string) {
  const nid = ctx.db.normalizeId("attachments", id);
  const doc = nid ? await ctx.db.get(nid) : null;
  return doc && doc.user_id === userId ? doc : null;
}

// The stored file as uploaded (its size and type), or why it can't be kept.
async function stored(ctx: MutationCtx, id: Id<"_storage">, type?: string): Promise<{ error: string } | { size: number; type: string }> {
  const meta = await ctx.db.system.get(id);
  if (!meta) return { error: "upload not found" };
  if (meta.size > MAX_BYTES) return { error: `files are limited to ${MAX_BYTES / 1024 / 1024} MB` };
  return { size: meta.size, type: cleanType(meta.contentType) ?? cleanType(type) ?? "application/octet-stream" };
}

const refuse = async (ctx: MutationCtx, id: Id<"_storage">, error: string) => {
  if (await ctx.db.system.get(id)) await ctx.storage.delete(id);
  return { error };
};

const countOn = async (ctx: MutationCtx, taskId: Id<"tasks">) =>
  (await ctx.db.query("attachments").withIndex("by_task", (q) => q.eq("task_id", taskId)).collect()).length;

export const uploadUrl = mutation({
  args: {},
  handler: async (ctx) => { await requireUser(ctx); return ctx.storage.generateUploadUrl(); },
});

// A task's files in the order they were added, each with an address to show or fetch it by.
export const list = query({
  args: { task_id: v.string() },
  handler: async (ctx, a) => {
    const task = await m.ownedTask(ctx.db, await requireUser(ctx), a.task_id);
    if (!task) return [];
    const files = await ctx.db.query("attachments").withIndex("by_task", (q) => q.eq("task_id", task._id)).collect();
    return Promise.all(files.map(async (f) => row(f, await ctx.storage.getUrl(f.storage_id))));
  },
});

const upload = { storage_id: v.id("_storage"), name: v.string(), type: v.optional(v.string()) };

export const add = mutation({
  args: { task_id: v.string(), ...upload },
  handler: async (ctx, a) => {
    const userId = await requireUser(ctx);
    const meta = await stored(ctx, a.storage_id, a.type);
    if ("error" in meta) return refuse(ctx, a.storage_id, meta.error);
    const task = await m.ownedTask(ctx.db, userId, a.task_id);
    if (!task) return refuse(ctx, a.storage_id, "task not found");
    const n = await countOn(ctx, task._id);
    if (n >= MAX_FILES) return refuse(ctx, a.storage_id, `a task holds up to ${MAX_FILES} files`);
    const id = await ctx.db.insert("attachments", {
      user_id: userId, task_id: task._id, storage_id: a.storage_id, name: cleanName(a.name) || "file",
      type: meta.type, size: meta.size, created_at: Date.now(),
    });
    await ctx.db.patch(task._id, { attachments: n + 1, updated_at: Date.now() });
    return row((await ctx.db.get(id))!, await ctx.storage.getUrl(a.storage_id));
  },
});

export const rename = mutation({
  args: { id: v.string(), name: v.string() },
  handler: async (ctx, a) => {
    const doc = (await owned(ctx, await requireUser(ctx), a.id)) ?? fail("attachment not found", "not_found");
    const name = cleanName(a.name);
    if (!name) fail("needs a name");
    await ctx.db.patch(doc._id, { name });
    return { id: a.id, name };
  },
});

// A new version of the file in its place, under the new file's name: the old one is deleted.
export const replace = mutation({
  args: { id: v.string(), ...upload },
  handler: async (ctx, a) => {
    const userId = await requireUser(ctx);
    const meta = await stored(ctx, a.storage_id, a.type);
    if ("error" in meta) return refuse(ctx, a.storage_id, meta.error);
    const old = await owned(ctx, userId, a.id);
    if (!old) return refuse(ctx, a.storage_id, "attachment not found");
    await ctx.storage.delete(old.storage_id);
    await ctx.db.patch(old._id, { storage_id: a.storage_id, type: meta.type, size: meta.size, name: cleanName(a.name) || old.name });
    return row((await ctx.db.get(old._id))!, await ctx.storage.getUrl(a.storage_id));
  },
});

export const remove = mutation({
  args: { id: v.string() },
  handler: async (ctx, a) => {
    const doc = (await owned(ctx, await requireUser(ctx), a.id)) ?? fail("attachment not found", "not_found");
    await ctx.storage.delete(doc.storage_id);
    await ctx.db.delete(doc._id);
    const task = await ctx.db.get(doc.task_id);
    if (task) await ctx.db.patch(task._id, { attachments: await countOn(ctx, task._id), updated_at: Date.now() });
    return { deleted: a.id };
  },
});
