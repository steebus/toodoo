import { ATTACH_MAX_BYTES } from "./attachments.ts";

// Pictures sent along with update_task (screenshots of a change): base64, bare or as a data: URL.
export const IMAGES_MAX = 10;
const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp", "image/avif": "avif", "image/svg+xml": "svg" };

export type ImageInput = { data?: unknown; name?: unknown; type?: unknown };
export type Decoded = { bytes: Uint8Array<ArrayBuffer>; type: string; name: string } | { error: string };

export function decodeImage(input: ImageInput, index: number): Decoded {
  const raw = typeof input?.data === "string" ? input.data.trim() : "";
  const url = /^data:([\w.+-]+\/[\w.+-]+)?(?:;[^,]*)?;base64,/i.exec(raw);
  const b64 = (url ? raw.slice(url[0].length) : raw).replace(/\s+/g, "");
  if (!b64 || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(b64)) return { error: `image ${index + 1}: data must be base64` };
  let bin: string;
  try { bin = atob(b64.replace(/-/g, "+").replace(/_/g, "/")); } catch { return { error: `image ${index + 1}: data is not valid base64` }; }
  if (bin.length > ATTACH_MAX_BYTES) return { error: `image ${index + 1}: files are limited to ${ATTACH_MAX_BYTES / 1024 / 1024} MB` };
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const declared = typeof input.type === "string" && /^image\/[\w.+-]+$/i.test(input.type) ? input.type.toLowerCase() : null;
  const type = declared ?? (url?.[1] && /^image\//i.test(url[1]) ? url[1].toLowerCase() : sniff(bytes));
  if (!type) return { error: `image ${index + 1}: not an image (give type, e.g. image/png)` };
  const name = typeof input.name === "string" && input.name.trim() ? input.name.trim() : `screenshot-${index + 1}.${EXT[type] ?? "png"}`;
  return { bytes, type, name };
}

function sniff(b: Uint8Array): string | null {
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8) return "image/jpeg";
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "image/gif";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57) return "image/webp";
  return null;
}
