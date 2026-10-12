import { beforeEach, expect, test } from "vitest";
import { clearCache, hasCachedBoard, lastUser, loadBoard, saveBoard, setLastUser } from "./offline";
import type { BoardData } from "../ui/types";

const b = (date: string) => ({ date, tasks: [] }) as unknown as BoardData;

beforeEach(() => localStorage.clear());

test("saves, loads and prunes to the two newest days", () => {
  expect(loadBoard("u1", "2026-10-10")).toBeUndefined();
  saveBoard("u1", "2026-10-10", b("2026-10-10"), 1);
  saveBoard("u1", "2026-10-11", b("2026-10-11"), 2);
  expect(loadBoard("u1", "2026-10-10")?.date).toBe("2026-10-10");
  saveBoard("u1", "2026-10-12", b("2026-10-12"), 3);
  expect(loadBoard("u1", "2026-10-10")).toBeUndefined();
  expect(loadBoard("u1", "2026-10-11")?.date).toBe("2026-10-11");
  expect(loadBoard("u1", "2026-10-12")?.date).toBe("2026-10-12");
});

test("is scoped per user and cleared on sign out", () => {
  saveBoard("u1", "2026-10-12", b("2026-10-12"));
  setLastUser("u1");
  expect(loadBoard("u2", "2026-10-12")).toBeUndefined();
  expect(hasCachedBoard("u1")).toBe(true);
  clearCache();
  expect(hasCachedBoard("u1")).toBe(false);
  expect(lastUser()).toBeUndefined();
  expect(localStorage.length).toBe(0);
});
