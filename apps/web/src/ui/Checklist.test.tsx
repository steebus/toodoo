import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { listLine } from "./build";
import { Checklist, copiedSteps, pastedSteps } from "./Checklist";

afterEach(cleanup);
const items = [{ text: "Passports", done: true }, { text: "Chargers", done: false }];

it("ticks a step and adds one with Enter, on the ticket", async () => {
  const onChange = vi.fn();
  render(<Checklist items={items} onChange={onChange} />);
  expect(screen.getByText("1/2")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("checkbox", { name: "Chargers" }));
  expect(onChange).toHaveBeenLastCalledWith([{ text: "Passports", done: true }, { text: "Chargers", done: true }]);
  await userEvent.type(screen.getByRole("textbox", { name: "Add a step" }), "Snacks{Enter}");
  expect(onChange).toHaveBeenLastCalledWith([...items, { text: "Snacks", done: false }]);
});

it("retypes a step in place, Enter going on to the next, and removes one", async () => {
  const onChange = vi.fn();
  render(<Checklist items={items} onChange={onChange} />);
  const first = screen.getByRole("textbox", { name: "Step 1" });
  await userEvent.clear(first);
  await userEvent.type(first, "Visas{Enter}");
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange).toHaveBeenLastCalledWith([{ text: "Visas", done: true }, { text: "Chargers", done: false }]);
  expect(screen.getByRole("textbox", { name: "Step 2" })).toHaveFocus();
  await userEvent.click(screen.getByRole("button", { name: "Remove Passports" }));
  expect(onChange).toHaveBeenLastCalledWith([{ text: "Chargers", done: false }]);
});

it("pastes several lines as a step each, and reads back what Copy writes", async () => {
  const onChange = vi.fn();
  render(<Checklist items={items} onChange={onChange} />);
  await userEvent.click(screen.getByRole("textbox", { name: "Add a step" }));
  await userEvent.paste("Snacks\n- [x] Tickets\n\n* Water");
  expect(onChange).toHaveBeenLastCalledWith([...items, { text: "Snacks", done: false }, { text: "Tickets", done: true }, { text: "Water", done: false }]);
  expect(pastedSteps(copiedSteps(items))).toEqual(items);
});

it("prints a checklist as boxes and a count", () => {
  expect(listLine({ done: 2, total: 4 })).toBe("■■□□ 2/4");
  expect(listLine({ done: 3, total: 12 })).toBe("3/12");
});
