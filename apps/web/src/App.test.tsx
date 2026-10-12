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
  useQuery: () => ({ tasks: { carried: [{}], due: [{}, {}], upcoming: [] } }),
}));

import { App } from "./App";
afterEach(cleanup);

it("offers sign-in when signed out", async () => {
  state.authed = false;
  render(<App />);
  await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
  expect(auth.signIn).toHaveBeenCalled();
});

it("shows the open count when signed in", () => {
  state.authed = true;
  render(<App />);
  expect(screen.getByText("3 open")).toBeInTheDocument();
});
