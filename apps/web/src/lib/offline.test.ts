import { beforeEach, expect, test } from "vitest";
import { loadBoard, saveBoard } from "./offline";
import type { BoardData } from "../ui/types";

const b = (date: string) => ({ date, tasks: [] }) as unknown as BoardData;

beforeEach(() => localStorage.clear());

test("saves, loads and prunes to the two newest days", () => {
  expect(loadBoard("2026-10-10")).toBeUndefined();
  saveBoard("2026-10-10", b("2026-10-10"), 1);
  saveBoard("2026-10-11", b("2026-10-11"), 2);
  expect(loadBoard("2026-10-10")?.date).toBe("2026-10-10");
  saveBoard("2026-10-12", b("2026-10-12"), 3);
  expect(loadBoard("2026-10-10")).toBeUndefined();
  expect(loadBoard("2026-10-11")?.date).toBe("2026-10-11");
  expect(loadBoard("2026-10-12")?.date).toBe("2026-10-12");
});
