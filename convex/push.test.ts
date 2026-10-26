// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const sent: { endpoint: string; body: string }[] = [];
vi.mock("web-push", () => {
  class WebPushError extends Error { constructor(public statusCode: number) { super("push said " + statusCode); } }
  const lib = {
    generateVAPIDKeys: () => ({ publicKey: "PUB", privateKey: "PRIV" }),
    setVapidDetails: () => {},
    sendNotification: async (s: { endpoint: string }, body: string) => {
      if (s.endpoint.includes("gone")) throw new WebPushError(410);
      sent.push({ endpoint: s.endpoint, body });
    },
  };
  return { default: lib, WebPushError };
});

const modules = import.meta.glob("./**/*.ts");
const setup = () => convexTest(schema, modules).withIdentity({ subject: "user_steve" });
// A cron round, then whatever sending it scheduled.
const round = async (t: ReturnType<typeof setup>) => {
  await t.mutation(internal.push.round, {});
  await t.finishAllScheduledFunctions(vi.runAllTimers);
};
const SUB = { endpoint: "https://push.example/phone", p256dh: "k", auth: "a" };

beforeEach(() => {
  vi.stubEnv("ALLOWED_USER_ID", "user_steve");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-15T20:58:00Z")); // 06:58 Brisbane
  sent.length = 0;
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

it("a device turned on gets the morning's due tasks once, and a timed one its lead before", async () => {
  const t = setup();
  await t.mutation(api.agent.addTasks, { tasks: [
    { title: "Bins", due: "2026-10-16", source: "you" },
    { title: "Standup", due: "2026-10-16", time: "09:00", source: "you" },
    { title: "Someday", source: "you" },
  ] });
  expect(await t.query(api.push.status, { endpoint: SUB.endpoint })).toMatchObject({ subscribed: false, remind_at: "07:00", lead_mins: 15 });
  await t.mutation(api.push.subscribe, SUB);
  expect(await t.query(api.push.status, { endpoint: SUB.endpoint })).toMatchObject({ subscribed: true, devices: 1 });

  vi.setSystemTime(new Date("2026-10-15T21:00:00Z")); // 07:00
  await round(t);
  expect(sent.map((s) => JSON.parse(s.body).title)).toEqual(["Bins"]);
  const scheduled = () => t.run(async (ctx) => (await ctx.db.system.query("_scheduled_functions").collect()).length);
  const before = await scheduled();
  await round(t); // nothing new in the window
  expect(sent).toHaveLength(1);
  expect(await scheduled()).toBe(before); // a quiet round leaves Node asleep

  await t.mutation(api.push.setPrefs, { lead_mins: 30 });
  vi.setSystemTime(new Date("2026-10-15T22:30:00Z")); // 08:30, Standup at 9 less 30 minutes
  await round(t);
  expect(JSON.parse(sent[1].body)).toMatchObject({ title: "Standup · in 30m", body: "Due 9am", url: "/?date=2026-10-16" });
});

it("refuses a bad time or lead; a forgotten device is dropped; off is off", async () => {
  const t = setup();
  await expect(t.mutation(api.push.setPrefs, { remind_at: "25:00" })).rejects.toThrow(/time of day/);
  await expect(t.mutation(api.push.setPrefs, { lead_mins: 7 })).rejects.toThrow(/lead/);
  await t.mutation(api.push.setPrefs, { remind_at: "6:30" });
  expect(await t.query(api.push.status, {})).toMatchObject({ remind_at: "06:30" });

  await t.mutation(api.push.subscribe, { ...SUB, endpoint: "https://push.example/gone" });
  expect(await t.action(api.pushSend.test, { endpoint: "https://push.example/gone" })).toBe("gone");
  expect(await t.query(api.push.status, {})).toMatchObject({ devices: 0 });

  await t.mutation(api.push.subscribe, SUB);
  expect(await t.action(api.pushSend.test, { endpoint: SUB.endpoint })).toBe("sent");
  expect(await t.action(api.pushSend.publicKey, {})).toBe("PUB");
  await t.mutation(api.push.unsubscribe, { endpoint: SUB.endpoint });
  expect(await t.query(api.push.status, { endpoint: SUB.endpoint })).toMatchObject({ subscribed: false, devices: 0 });
});
