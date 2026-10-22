import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { ATTACH_MAX_BYTES } from "@shared/attachments.ts";

// Post a file to a Convex upload address, with its progress; the stored file's id comes back.
function post(url: string, file: File, onPct?: (pct: number) => void) {
  return new Promise<Id<"_storage">>((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open("POST", url);
    x.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    x.upload.onprogress = (e) => e.lengthComputable && onPct?.(Math.round((e.loaded / e.total) * 100));
    x.onload = () => {
      try { if (x.status < 300) return resolve(JSON.parse(x.responseText).storageId); } catch { /* falls through */ }
      reject(new Error(`upload failed (${x.status})`));
    };
    x.onerror = () => reject(new Error("upload failed"));
    x.send(file);
  });
}

export type Attach = (taskId: string, file: File, o?: { onto?: string; onPct?: (pct: number) => void }) => Promise<string | null>;

// One file up and filed on a task: onto a new line, or (onto) in place of a file already there. What went wrong, or null.
export function useAttach(): Attach {
  const uploadUrl = useMutation(api.attachments.uploadUrl);
  const add = useMutation(api.attachments.add);
  const replace = useMutation(api.attachments.replace);
  return async (taskId, file, { onto, onPct } = {}) => {
    if (file.size > ATTACH_MAX_BYTES) return `${file.name} is over ${ATTACH_MAX_BYTES / 1024 / 1024} MB`;
    try {
      const args = { storage_id: await post(await uploadUrl(), file, onPct), name: file.name, type: file.type || undefined };
      const r = onto ? await replace({ id: onto, ...args }) : await add({ task_id: taskId, ...args });
      return "error" in r ? `${file.name}: ${r.error}` : null;
    } catch (e) {
      return (e as { data?: { message?: string } })?.data?.message ?? `Couldn't upload ${file.name}`;
    }
  };
}
