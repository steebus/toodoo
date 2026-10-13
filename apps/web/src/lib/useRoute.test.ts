import { expect, it } from "vitest";
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
});
