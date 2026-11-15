import { expect, it, vi } from "vitest";
import { pathOf, roomOf } from "./useRoute";

it("maps paths to rooms; anything else, AuthKit's /callback included, is the day", () => {
  expect(roomOf("/board")).toBe("board");
  expect(roomOf("/epics")).toBe("epics");
  expect(roomOf("/epics/")).toBe("epics");
  expect(roomOf("/")).toBe("day");
  expect(roomOf("/callback")).toBe("day");
  expect(roomOf("/boardroom")).toBe("day");
  expect(pathOf("board")).toBe("/board");
  expect(roomOf("/share")).toBe("share");
  expect(roomOf("/matrix")).toBe("matrix");
});

it("holds the browser's own back to a different room and replays it, so the slide can wrap it", async () => {
  const { go } = await import("./useRoute");
  const heard: boolean[] = [];
  const hear = (e: Event) => heard.push(e.isTrusted);
  window.addEventListener("popstate", hear);
  go("board"); // the app's own: heard as is
  window.history.back(); // the browser's: back to the day
  await vi.waitFor(() => expect(window.location.pathname).toBe("/"));
  await vi.waitFor(() => expect(heard).toEqual([false, false])); // the trusted one held, its replay heard
  window.removeEventListener("popstate", hear);
});
