import { useAuth } from "@workos-inc/authkit-react";
import { Component, Fragment, useEffect, useState, type ReactNode } from "react";
import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { clearCache, hasCachedBoard, lastUser, loadBoard, localDate, setLastUser, useOffline } from "./lib/offline";
import { useActions } from "./lib/useActions";
import { useBoard } from "./lib/useBoard";
import { useDayChange } from "./lib/useDayChange";
import { useViewDate } from "./lib/useViewDate";
import { Hero, HeroShell } from "./ui/Hero";
import type { BoardData } from "./ui/types";

// The comp's content lives in a gitignored fixtures file; the glob is empty when it is absent (CI),
// and production builds drop it entirely so the fixture never ships.
type Fixture = { boardFixture: BoardData; quickAddFixture?: string };
const fixtureModules: Record<string, () => Promise<Fixture>> = import.meta.env.DEV
  ? import.meta.glob<Fixture>("./ui/fixtures.ts")
  : {};

function FixtureHero() {
  const [fx, setFx] = useState<Fixture | null>(null);
  useEffect(() => {
    fixtureModules["./ui/fixtures.ts"]?.().then(setFx);
  }, []);
  return fx ? (
    <Hero board={fx.boardFixture} quickAdd={fx.quickAddFixture}
      nav={{ date: fx.boardFixture.date, onDate: () => {} }} />
  ) : null;
}

function useSignOut() {
  const { signOut } = useAuth();
  return () => {
    clearCache();
    void signOut();
  };
}

function Live({ board, date, onDate }: { board: BoardData; date: string; onDate: (d: string) => void }) {
  const out = useSignOut();
  const actions = useActions(board);
  return <Hero board={board} onSignOut={out} actions={actions} nav={{ date, onDate }} />;
}

function Home({ cached }: { cached?: string }) {
  const { user } = useAuth();
  // Never fall back to the stored last user when signed in: a new account would cache under the old key.
  const userId = user?.id ?? cached;
  useEffect(() => {
    if (user?.id) setLastUser(user.id);
  }, [user?.id]);
  const [date, setDate] = useViewDate();
  const board = useDayChange(useBoard(date, userId));
  if (!board) return <HeroShell />;
  // The nav follows the requested day at once, even while its board is still on the way.
  return <Live board={board} date={date ?? board.today} onDate={(d) => setDate(d === board.today ? undefined : d)} />;
}

// A query that throws (a server error, or "sign in required" on a cold start) lands here, not on a white screen:
// today's kept board read-only if there is one, with Retry (a remount) and Sign out.
function Fault({ cached, onRetry }: { cached?: string; onRetry: () => void }) {
  const { user } = useAuth();
  const out = useSignOut();
  const userId = user?.id ?? cached;
  const kept = userId ? loadBoard(userId, localDate()) : undefined;
  return (
    <>
      {kept ? <Hero board={kept} onSignOut={out} /> : <HeroShell />}
      <p className="fault">
        <button type="button" onClick={onRetry}>Retry</button>
        <button type="button" onClick={out}>Sign out</button>
      </p>
    </>
  );
}

class Guard extends Component<{ cached?: string; children: ReactNode }, { failed: boolean; key: number }> {
  state = { failed: false, key: 0 };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) {
      return <Fault cached={this.props.cached} onRetry={() => this.setState((s) => ({ failed: false, key: s.key + 1 }))} />;
    }
    return <Fragment key={this.state.key}>{this.props.children}</Fragment>;
  }
}

// Offline with no way to sign in: the last signed-in person's kept board is shown read-only (Home gates its writes).
// Once Convex reconnects and auth resolves, the Authenticated path takes over.
function ColdStart({ children }: { children: ReactNode }) {
  const offline = useOffline();
  const last = lastUser();
  return offline && last && hasCachedBoard(last) ? <Guard cached={last}><Home cached={last} /></Guard> : <>{children}</>;
}

function SignIn() {
  const { signIn } = useAuth();
  return (
    <main className="mx-auto mt-24 max-w-sm p-6">
      <h1 className="mb-6 text-2xl font-semibold">toodoo</h1>
      <button onClick={() => signIn()} className="rounded bg-black px-3 py-2 text-white">Sign in</button>
    </main>
  );
}

export function App() {
  if (new URLSearchParams(window.location.search).get("fixture") === "1") return <FixtureHero />;
  return (
    <>
      <AuthLoading><ColdStart>{null}</ColdStart></AuthLoading>
      <Unauthenticated><ColdStart><SignIn /></ColdStart></Unauthenticated>
      <Authenticated><Guard><Home /></Guard></Authenticated>
    </>
  );
}
