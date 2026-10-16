import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ data: {} as Record<string, unknown>, fns: {} as Record<string, any> }));
vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  const fnFor = (ref: any) => {
    const name = getFunctionName(ref);
    if (!state.fns[name]) {
      const fn: any = vi.fn().mockResolvedValue({});
      fn.withOptimisticUpdate = () => fn;
      state.fns[name] = fn;
    }
    return state.fns[name];
  };
  return { useQuery: (ref: any) => state.data[getFunctionName(ref)], useMutation: fnFor, useAction: fnFor };
});

import { SettingsRoom } from "./SettingsRoom";

const fn = (name: string) => state.fns[name];
beforeEach(() => {
  state.data = {
    "calendar:feeds": [{ id: "f1", label: "steve@example.com", colour: "rose", synced_at: Date.now(), tried_at: null, error: null }],
    "jira:link": null,
    "push:status": { remind_at: "07:00", lead_mins: 15, devices: 0, subscribed: false },
  };
  state.fns = {};
});
afterEach(() => { cleanup(); localStorage.clear(); delete document.documentElement.dataset.theme; });

it("lays out Connections (calendars, Jira), Notifications, Appearance, then Sign out at the foot", async () => {
  const out = vi.fn();
  render(<SettingsRoom onSignOut={out} />);
  expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["Connections", "Notifications", "Appearance"]);
  expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Calendars", "Jira"]);
  const buttons = screen.getAllByRole("button");
  expect(buttons.at(-1)).toHaveTextContent("Sign out");
  await userEvent.click(buttons.at(-1)!);
  expect(out).toHaveBeenCalled();
});

it("gives a calendar a colour", async () => {
  render(<SettingsRoom />);
  const colours = screen.getByRole("group", { name: "Colour for steve@example.com" });
  expect(within(colours).getByRole("radio", { name: "Rose" })).toBeChecked();
  await userEvent.click(within(colours).getByRole("radio", { name: "Moss" }));
  expect(fn("calendar:setColour")).toHaveBeenCalledWith({ id: "f1", colour: "moss" });
});

it("links Jira", async () => {
  render(<SettingsRoom />);
  await userEvent.click(screen.getByRole("button", { name: "Link Jira" }));
  await userEvent.type(screen.getByRole("textbox", { name: "Site" }), "acme");
  await userEvent.type(screen.getByRole("textbox", { name: "Email" }), "steve@example.com");
  await userEvent.type(screen.getByLabelText(/API token/), "tok");
  await userEvent.click(screen.getByRole("button", { name: "Link Jira" }));
  expect(fn("jira:save")).toHaveBeenCalledWith({ site: "acme", email: "steve@example.com", token: "tok", jql: "" });
});

it("sets when reminders fire, and says when this browser can't show them", async () => {
  render(<SettingsRoom />);
  expect(await screen.findByText(/This browser can't show them/)).toBeInTheDocument(); // jsdom: no service worker
  await userEvent.selectOptions(screen.getByRole("combobox"), "30");
  expect(fn("push:setPrefs")).toHaveBeenCalledWith({ lead_mins: 30 });
  expect(screen.getByDisplayValue("07:00")).toBeInTheDocument();
});

it("switches the theme", async () => {
  render(<SettingsRoom />);
  const theme = screen.getByRole("radiogroup", { name: "Theme" });
  expect(within(theme).getByRole("radio", { name: /Auto/ })).toHaveAttribute("aria-checked", "true");
  await userEvent.click(within(theme).getByRole("radio", { name: /Dark/ }));
  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(within(theme).getByRole("radio", { name: /Dark/ })).toHaveAttribute("aria-checked", "true");
});
