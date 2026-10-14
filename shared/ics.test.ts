import { expect, test } from "vitest";
import { icsEvents } from "./ics.ts";

const TZ = `BEGIN:VTIMEZONE
TZID:Australia/Brisbane
BEGIN:STANDARD
TZOFFSETFROM:+1000
TZOFFSETTO:+1000
TZNAME:AEST
DTSTART:19700101T000000
END:STANDARD
END:VTIMEZONE`;

const feed = (...events: string[]) =>
  ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:test", TZ, ...events.map((e) => `BEGIN:VEVENT\n${e}\nEND:VEVENT`), "END:VCALENDAR"]
    .join("\n").replace(/\n/g, "\r\n");

test("timed, UTC, all-day, repeating, moved, skipped and cancelled events land on their local days", () => {
  const ics = feed(
    "UID:a\nDTSTART;TZID=Australia/Brisbane:20261014T093000\nDTEND;TZID=Australia/Brisbane:20261014T100000\nSUMMARY:Standup\nLOCATION:Teams\\nlink",
    "UID:b\nDTSTART:20261014T230000Z\nDTEND:20261015T000000Z\nSUMMARY:UTC one", // 9am Brisbane on the 15th
    "UID:c\nDTSTART;VALUE=DATE:20261015\nDTEND;VALUE=DATE:20261017\nSUMMARY:Away",
    "UID:d\nDTSTART;TZID=Australia/Brisbane:20260901T150000\nDTEND;TZID=Australia/Brisbane:20260901T160000\nRRULE:FREQ=DAILY\nEXDATE;TZID=Australia/Brisbane:20261015T150000\nSUMMARY:Daily",
    "UID:d\nRECURRENCE-ID;TZID=Australia/Brisbane:20261016T150000\nDTSTART;TZID=Australia/Brisbane:20261016T170000\nDTEND;TZID=Australia/Brisbane:20261016T173000\nSUMMARY:Daily moved",
    "UID:e\nDTSTART;TZID=Australia/Brisbane:20261014T120000\nDTEND;TZID=Australia/Brisbane:20261014T130000\nSTATUS:CANCELLED\nSUMMARY:Gone",
  );
  const r = icsEvents(ics, "2026-10-14", "2026-10-16");
  expect(r["2026-10-14"]).toEqual([
    { start: "09:30", end: "10:00", title: "Standup", where: "Teams" },
    { start: "15:00", end: "16:00", title: "Daily" },
  ]);
  expect(r["2026-10-15"]).toEqual([
    { start: "00:00", end: "23:59", title: "Away", allDay: true },
    { start: "09:00", end: "10:00", title: "UTC one" },
  ]);
  expect(r["2026-10-16"]).toEqual([
    { start: "00:00", end: "23:59", title: "Away", allDay: true },
    { start: "17:00", end: "17:30", title: "Daily moved" },
  ]);
  expect(Object.keys(r)).toEqual(["2026-10-14", "2026-10-15", "2026-10-16"]);
});
