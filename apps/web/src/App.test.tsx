import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ signIn: vi.fn(), signOut: vi.fn() }));
const state = vi.hoisted(() => ({ authed: false, live: true }));
vi.mock("@workos-inc/authkit-react", () => ({ useAuth: () => auth }));
vi.mock("convex/react", () => ({
  Authenticated: ({ children }: any) => (state.authed ? children : null),
  Unauthenticated: ({ children }: any) => (state.authed ? null : children),
  AuthLoading: () => null,
  useConvexConnectionState: () => ({ hasEverConnected: true, isWebSocketConnected: true }),
  useMutation: () => Object.assign(vi.fn(), { withOptimisticUpdate() { return this; } }),
  useQuery: () => !state.live ? undefined : ({
    today: "2026-03-10", date: "2026-03-10", nowM: 600, app_url: null, day: null, tasks: [], blocks: [], suggestions: [],
  }),
}));

import { App } from "./App";
import { loadBoard, saveBoard } from "./lib/offline";
beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  state.live = true;
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
});

it("offers sign-in when signed out", async () => {
  state.authed = false;
  render(<App />);
  await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
  expect(auth.signIn).toHaveBeenCalled();
});

it("shows the board when signed in", () => {
  state.authed = true;
  render(<App />);
  expect(screen.getByRole("heading", { level: 1, name: "Tuesday 10 March" })).toBeInTheDocument();
});

const kept = {
  today: "2026-03-10", date: "2026-03-10", nowM: 600, app_url: null, day: null, suggestions: [], blocks: [],
  tasks: [{ id: "t1", title: "Kept task", due: "2026-03-10", time: null, priority: null, estimate_mins: null, done: false, done_on: null, sort_order: 1, source: "you", external_id: null, tags: [], link: null, note: null, description: null }],
};

it("cold start offline and signed out: shows the kept board, read-only", () => {
  state.authed = false;
  state.live = false;
  Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
  vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-03-10T10:00:00") });
  saveBoard("u1", "2026-03-10", kept as any);
  localStorage.setItem("toodoo.lastUser", "u1");
  render(<App />);
  vi.useRealTimers();
  expect(screen.getAllByText(/kept task/i)[0]).toBeInTheDocument();
  expect(screen.getByText("offline")).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "New to do" })).toBeDisabled();
  expect(screen.queryByRole("button", { name: "Sign in" })).toBeNull();
});

it("signing out clears the kept boards", async () => {
  state.authed = true;
  saveBoard("u1", "2026-03-10", kept as any);
  render(<App />);
  await userEvent.click(document.querySelector(".viewmenu-button")!);
  await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
  expect(auth.signOut).toHaveBeenCalled();
  expect(loadBoard("u1", "2026-03-10")).toBeUndefined();
});
