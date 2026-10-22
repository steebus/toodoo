// Files on a task: the limits both ends hold to, and how the ticket prints them.
export const ATTACH_MAX_BYTES = 25 * 1024 * 1024;
export const ATTACH_MAX_FILES = 30;

export interface Attachment { id: string; name: string; type: string; size: number; created_at: number; url: string | null }

// Shown in the carousel rather than listed: what a browser draws as an <img>.
export const isPicture = (a: { type: string }) => /^image\/(png|jpe?g|gif|webp|avif|bmp|svg\+xml)$/.test(a.type);

// "840 KB", "3.2 MB": as a file manager would print it.
export function fileSize(n: number) {
  if (n < 1024) return `${n} B`;
  const [v, u] = n < 1024 ** 2 ? [n / 1024, "KB"] : [n / 1024 ** 2, "MB"];
  return `${v < 10 ? v.toFixed(1).replace(/\.0$/, "") : Math.round(v)} ${u}`;
}

// The stamp on a file's line: its extension ("PDF"), or FILE when it has none.
export const fileKind = (name: string) => (/\.([a-z0-9]{1,4})$/i.exec(name)?.[1] ?? "file").toUpperCase();
