// @vitest-environment node
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";

// public/share-sw.js in a stand-in service worker: a fetch listener, and Cache Storage as a map.
function worker() {
  const store = new Map<string, Response>([["/shared-file/7", new Response("stale")]]);
  const cache = {
    keys: async () => [...store.keys()],
    delete: async (k: string) => store.delete(k),
    put: async (k: string, r: Response) => void store.set(k, r),
  };
  let onFetch: ((e: unknown) => void) | undefined;
  const self = { location: { origin: "https://toodoo.app" }, addEventListener: (_: string, fn: (e: unknown) => void) => (onFetch = fn) };
  const code = readFileSync(new URL("../../public/share-sw.js", import.meta.url), "utf8");
  runInNewContext(code, { self, caches: { open: async () => cache }, URL, URLSearchParams, Response, String });
  const send = async (req: Request) => {
    let answer: Promise<Response> | undefined;
    onFetch!({ request: req, respondWith: (p: Promise<Response>) => (answer = p) });
    return answer;
  };
  return { store, send };
}

it("keeps shared files for the share room and opens it with how many wait", async () => {
  const { store, send } = worker();
  const form = new FormData();
  form.set("title", "Site visit");
  form.set("text", "");
  form.append("files", new File(["png"], "IMG_1.png", { type: "image/png" }));
  form.append("files", new File(["pdf!"], "plan b.pdf", { type: "application/pdf" }));
  form.append("files", new File([], "empty.png", { type: "image/png" }));
  const r = (await send(new Request("https://toodoo.app/share", { method: "POST", body: form })))!;
  expect(r.status).toBe(303);
  expect(r.headers.get("location")).toBe("https://toodoo.app/share?title=Site+visit&files=2");
  expect([...store.keys()]).toEqual(["/shared-file/0", "/shared-file/1"]); // the last share's went
  const second = store.get("/shared-file/1")!;
  expect(decodeURIComponent(second.headers.get("x-name")!)).toBe("plan b.pdf");
  expect(second.headers.get("content-type")).toBe("application/pdf");
  expect(await second.text()).toBe("pdf!");
});

it("leaves every other request alone", async () => {
  const { send } = worker();
  expect(await send(new Request("https://toodoo.app/share?title=x"))).toBeUndefined();
  expect(await send(new Request("https://toodoo.app/api", { method: "POST", body: "x" }))).toBeUndefined();
});
