import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ signIn: vi.fn(), signOut: vi.fn(), user: undefined as { id: string } | undefined }));
const state = vi.hoisted(() => ({ authed: false, authLoading: false, live: true, socket: true, throws: null as Error | null }));
vi.mock("@workos-inc/authkit-react", () => ({ useAuth: () => auth }));
vi.mock("convex/react", () => ({
  Authenticated: ({ children }: any) => (state.authed && !state.authLoading ? children : null),
  Unauthenticated: ({ children }: any) => (state.authed || state.authLoading ? null : children),
  AuthLoading: ({ children }: any) => (state.authLoading ? children : null),
  useConvexConnectionState: () => ({ hasEverConnected: state.socket, isWebSocketConnected: state.socket }),
  useMutation: () => Object.assign(vi.fn(), { withOptimisticUpdate() { return this; } }),
  useQuery: () => {
    if (state.throws) throw state.throws;
    return useQueryValue();
  },
}));
const useQueryValue = () => !state.live ? undefined : ({
    today: "2026-03-10", date: "2026-03-10", nowM: 600, app_url: null, day: null, tasks: [], blocks: [], suggestions: [],
  });

import { App } from "./App";
import { loadBoard, saveBoard } from "./lib/offline";
beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  state.live = true;
  state.socket = true;
  state.throws = null;
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
  await userEvent.click(document.querySelector(".daymenu-button")!);
  await userEvent.click(screen.getByRole("menuitem", { name: "Sign out" }));
  expect(auth.signOut).toHaveBeenCalled();
  expect(loadBoard("u1", "2026-03-10")).toBeUndefined();
});

it("cold start with the radio on but no network: the kept board after a few seconds without a socket, reconnecting", () => {
  state.authed = false;
  state.live = false;
  state.socket = false;
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"], now: new Date("2026-03-10T10:00:00") });
  saveBoard("u1", "2026-03-10", kept as any);
  localStorage.setItem("toodoo.lastUser", "u1");
  render(<App />);
  expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  act(() => void vi.advanceTimersByTime(4000));
  expect(screen.getAllByText(/kept task/i)[0]).toBeInTheDocument();
  expect(screen.getByText("reconnecting")).toBeInTheDocument();
});

it("a query that throws shows the kept board with Retry and Sign out; Retry remounts", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  state.authed = true;
  state.throws = new Error("Server Error");
  auth.user = { id: "u1" };
  vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-03-10T10:00:00") });
  saveBoard("u1", "2026-03-10", kept as any);
  try {
    render(<App />);
    expect(screen.getAllByText(/kept task/i)[0]).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
    state.throws = null;
    vi.useRealTimers();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "Tuesday 10 March" })).toBeInTheDocument();
  } finally {
    auth.user = undefined;
    vi.mocked(console.error).mockRestore();
  }
});

it("cold start: a board query refused for want of sign-in falls back to the kept board", () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  state.authed = false;
  state.throws = new Error("sign in required");
  Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
  vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-03-10T10:00:00") });
  saveBoard("u1", "2026-03-10", kept as any);
  localStorage.setItem("toodoo.lastUser", "u1");
  try {
    render(<App />);
    expect(screen.getAllByText(/kept task/i)[0]).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  } finally {
    vi.mocked(console.error).mockRestore();
  }
});

it("a cold start while sign-in is still being checked shows the kept board at once", () => {
  state.authLoading = true;
  state.live = false; // no data before auth: the socket waits for the token
  vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-03-10T10:00:00") });
  saveBoard("u1", "2026-03-10", kept as any);
  localStorage.setItem("toodoo.lastUser", "u1");
  try {
    render(<App />);
    expect(screen.getAllByText(/kept task/i)[0]).toBeInTheDocument();
  } finally {
    vi.useRealTimers();
    state.authLoading = false;
  }
});
