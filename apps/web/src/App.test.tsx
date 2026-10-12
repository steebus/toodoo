import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ signIn: vi.fn(), signOut: vi.fn() }));
const state = vi.hoisted(() => ({ authed: false }));
vi.mock("@workos-inc/authkit-react", () => ({ useAuth: () => auth }));
vi.mock("convex/react", () => ({
  Authenticated: ({ children }: any) => (state.authed ? children : null),
  Unauthenticated: ({ children }: any) => (state.authed ? null : children),
  AuthLoading: () => null,
  useMutation: () => Object.assign(vi.fn(), { withOptimisticUpdate() { return this; } }),
  useQuery: () => ({
    today: "2026-03-10", date: "2026-03-10", nowM: 600, app_url: null, day: null, tasks: [], blocks: [], suggestions: [],
  }),
}));

import { App } from "./App";
afterEach(cleanup);

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
