import { useAuth } from "@workos-inc/authkit-react";
import { useEffect, useState } from "react";
import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { useActions } from "./lib/useActions";
import { useBoard } from "./lib/useBoard";
import { Hero, HeroShell } from "./ui/Hero";
import type { BoardData, Legend } from "./ui/types";

// The comp's content lives in a gitignored fixtures file; the glob is empty when it is absent (CI),
// and production builds drop it entirely so the fixture never ships.
type Fixture = { boardFixture: BoardData; legendFixture?: Legend; quickAddFixture?: string };
const fixtureModules: Record<string, () => Promise<Fixture>> = import.meta.env.DEV
  ? import.meta.glob<Fixture>("./ui/fixtures.ts")
  : {};

function FixtureHero() {
  const [fx, setFx] = useState<Fixture | null>(null);
  useEffect(() => {
    fixtureModules["./ui/fixtures.ts"]?.().then(setFx);
  }, []);
  return fx ? <Hero board={fx.boardFixture} legend={fx.legendFixture} quickAdd={fx.quickAddFixture} /> : null;
}

function Live({ board }: { board: BoardData }) {
  const { signOut } = useAuth();
  const actions = useActions(board);
  return <Hero board={board} onSignOut={() => signOut()} actions={actions} />;
}

function Home() {
  const board = useBoard();
  return board ? <Live board={board} /> : <HeroShell />;
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
      <AuthLoading>{null}</AuthLoading>
      <Unauthenticated><SignIn /></Unauthenticated>
      <Authenticated><Home /></Authenticated>
    </>
  );
}
