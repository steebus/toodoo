import { useAuth } from "@workos-inc/authkit-react";
import { useEffect, useState } from "react";
import { Authenticated, AuthLoading, Unauthenticated, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Hero } from "./ui/Hero";
import type { HeroData } from "./ui/types";

// The comp's content lives in a gitignored fixtures file; the glob is empty when it is absent (CI),
// and production builds drop it entirely so the fixture never ships.
const fixtureModules: Record<string, () => Promise<{ heroFixture: HeroData }>> = import.meta.env.DEV
  ? import.meta.glob<{ heroFixture: HeroData }>("./ui/fixtures.ts")
  : {};

function FixtureHero() {
  const [data, setData] = useState<HeroData | null>(null);
  useEffect(() => {
    fixtureModules["./ui/fixtures.ts"]?.().then((m) => setData(m.heroFixture));
  }, []);
  return data ? <Hero data={data} /> : null;
}

// Placeholder home until Plan 2 builds the real UI.
// Convex queries are cached, so hand the server a minute-rounded clock to keep "today" fresh.
function useMinuteTick() {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 60000) * 60000);
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 60000) * 60000), 60000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function Home() {
  const now = useMinuteTick();
  const s = useQuery(api.agent.getSnapshot, { now });
  const { signOut } = useAuth();
  const open = s ? s.tasks.carried.length + s.tasks.due.length + s.tasks.upcoming.length : null;
  return (
    <main className="p-6">
      <h1 className="text-2xl font-semibold">toodoo</h1>
      {open != null && <p>{open} open</p>}
      <button className="mt-4 underline" onClick={() => signOut()}>Sign out</button>
    </main>
  );
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
