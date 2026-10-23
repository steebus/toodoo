import { cleanup, createEvent, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { QuickAdd } from "./QuickAdd";

afterEach(cleanup);
const setup = (id: string | null = "t1") => {
  const onCreate = vi.fn(async () => id);
  const onOpen = vi.fn();
  render(<QuickAdd today="2026-10-12" nowM={540} onCreate={onCreate} onOpen={onOpen} />);
  return { onCreate, onOpen, input: screen.getByRole("textbox", { name: "New to do" }) };
};

it("Ctrl+Enter files the line and opens the new ticket; Enter only files it", async () => {
  const { onCreate, onOpen, input } = setup();
  await userEvent.type(input, "Buy milk{Enter}");
  await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
  expect(onOpen).not.toHaveBeenCalled();
  await userEvent.type(input, "Call Sam{Control>}{Enter}{/Control}");
  await waitFor(() => expect(onOpen).toHaveBeenCalledWith("t1"));
  expect(onCreate).toHaveBeenCalledTimes(2);
});

it("holds a pasted picture as a chip and hands it over with the task", async () => {
  const { onCreate, input } = setup();
  await userEvent.type(input, "Fix header");
  const file = new File(["x"], "shot.png", { type: "image/png" });
  const paste = createEvent.paste(input);
  Object.defineProperty(paste, "clipboardData", { value: { files: [file] } });
  fireEvent(input, paste);
  expect(await screen.findByText("shot.png")).toBeInTheDocument();
  await userEvent.type(input, "{Enter}");
  await waitFor(() => expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ title: "Fix header" }), [file]));
  expect(screen.queryByText("shot.png")).toBeNull();
});

it("a cancelled line leaves nothing behind: the picture was never uploaded", async () => {
  const { onCreate, input } = setup();
  const paste = createEvent.paste(input);
  Object.defineProperty(paste, "clipboardData", { value: { files: [new File(["x"], "a.png", { type: "image/png" })] } });
  fireEvent(input, paste);
  await userEvent.click(await screen.findByRole("button", { name: "Remove a.png" }));
  expect(screen.queryByText("a.png")).toBeNull();
  expect(onCreate).not.toHaveBeenCalled();
});
