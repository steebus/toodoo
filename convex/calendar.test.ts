// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const setup = () => convexTest(schema, modules).withIdentity({ subject: "user_steve" });
const URL_ = "webcal://calendar.google.com/calendar/ical/steve%40example.com/private-s3cret/basic.ics";
const ICS = [
  "BEGIN:VCALENDAR", "VERSION:2.0",
  "BEGIN:VEVENT", "UID:a", "DTSTART:20261012T053000Z", "DTEND:20261012T060000Z", "SUMMARY:Dentist", "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

beforeEach(() => {
  vi.stubEnv("ALLOWED_USER_ID", "user_steve");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-12T02:00:00Z")); // 12:00 Brisbane
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it("a feed owns the day's events: synced in, kept through a failed fetch, never overwritten by set_day", async () => {
  const t = setup();
  await t.mutation(api.agent.setDay, { day: { date: "2026-10-12", headline: "Old", events: [{ start: "12:30", end: "13:15", title: "Haircut" }] } });
  await t.mutation(api.calendar.addFeed, { url: URL_ });
  const feeds = await t.query(api.calendar.feeds, {});
  expect(feeds).toMatchObject([{ label: "steve@example.com", error: null }]);
  expect(JSON.stringify(feeds)).not.toContain("s3cret");

  const fetchMock = vi.fn(async () => new Response(ICS));
  vi.stubGlobal("fetch", fetchMock);
  const users = await t.run((ctx) => ctx.db.query("calendar_feeds").collect());
  await t.action(internal.calendar.syncUser, { user_id: users[0].user_id });
  expect(fetchMock).toHaveBeenCalledWith("https://calendar.google.com/calendar/ical/steve%40example.com/private-s3cret/basic.ics", expect.anything());
  let snap = await t.query(api.agent.getSnapshot, {});
  expect(snap.calendar_feed).toBe(true);
  expect(snap.day?.events).toEqual([{ start: "15:30", end: "16:00", title: "Dentist" }]);
  expect(snap.day?.headline).toBe("Old");

  await t.mutation(api.agent.setDay, { day: { date: "2026-10-12", headline: "New", events: [{ start: "12:30", end: "13:15", title: "Haircut" }] } });
  vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 404 })));
  await t.action(internal.calendar.syncUser, { user_id: users[0].user_id });
  snap = await t.query(api.agent.getSnapshot, {});
  expect(snap.day).toMatchObject({ headline: "New", events: [{ title: "Dentist" }] });
  expect(await t.query(api.calendar.feeds, {})).toMatchObject([{ error: "calendar said 404" }]);
});

it("refuses addresses that aren't https", async () => {
  const t = setup();
  await expect(t.mutation(api.calendar.addFeed, { url: "http://example.com/a.ics" })).rejects.toThrow(/https/);
  await expect(t.mutation(api.calendar.addFeed, { url: "not a url" })).rejects.toThrow(/web address/);
});
