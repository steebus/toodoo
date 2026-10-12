import { cleanup, render } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { SlotPicker } from "./SlotPicker";
import type { BoardData } from "./types";

afterEach(cleanup);

const board: BoardData = {
  today: "2026-03-10", date: "2026-03-10", nowM: 600, app_url: null, day: null, tasks: [], blocks: [], suggestions: [],
};

it("stays open when StrictMode runs its effect twice", () => {
  const opener = document.createElement("button");
  document.body.append(opener);
  opener.focus();
  const onClose = vi.fn();
  const { container } = render(
    <StrictMode>
      <SlotPicker at={600} board={board} onPick={() => {}} onCreate={() => {}} onClose={onClose} />
    </StrictMode>,
  );
  const dialog = container.querySelector("dialog")!;
  expect(onClose).not.toHaveBeenCalled();
  expect(dialog.open).toBe(true);
  expect(document.activeElement).toBe(dialog.querySelector(".slotpick-search"));
  opener.remove();
});
