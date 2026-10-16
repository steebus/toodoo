import { useAuth } from "@workos-inc/authkit-react";
import { Component, Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { clearCache, hasCachedBoard, lastUser, loadBoard, localDate, setLastUser, useOffline } from "./lib/offline";
import { useActions } from "./lib/useActions";
import { useBoard } from "./lib/useBoard";
import { useDayChange } from "./lib/useDayChange";
import { useViewDate } from "./lib/useViewDate";
import { pendingShare } from "./lib/share";
import { go, useRoute } from "./lib/useRoute";
import { useEverything, useWorkActions, useWorkspace } from "./lib/useWork";
import { AllTasks } from "./ui/AllTasks";
import { Stats } from "./ui/Stats";
import { Tidy } from "./ui/Tidy";
import { Epics } from "./ui/Epics";
import { Hero, HeroShell } from "./ui/Hero";
import { Kanban } from "./ui/Kanban";
import { Matrix } from "./ui/Matrix";
import { RoomShell, RoomSkeleton } from "./ui/RoomShell";
import { ShareRoom } from "./ui/ShareRoom";
import { SettingsRoom } from "./ui/SettingsRoom";
import { CalendarRoom } from "./ui/CalendarRoom";
import { Suggested } from "./ui/Suggested";
import { SignIn as Door } from "./ui/SignIn";
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
  const actions = useActions(board);
  return <Hero board={board} actions={actions} nav={{ date, onDate }} />;
}

// The Board and Epics rooms work from one live query; until it lands, the room's frame.
// Today's board for the shared header (date, the day's line, Focus), kept like the Day view's for offline.
function useTodayBoard() {
  const { user } = useAuth();
  return useBoard(undefined, user?.id);
}

function SideRoom({ room }: { room: "share" | "settings" | "suggested" }) {
  const out = useSignOut();
  const offline = useOffline();
  const board = useTodayBoard();
  return (
    <RoomShell room={room} board={board} offline={offline}>
      {room === "share" ? <ShareRoom offline={offline} /> : room === "suggested" ? <Suggested offline={offline} /> : <SettingsRoom offline={offline} onSignOut={out} />}
    </RoomShell>
  );
}

function WorkRoom({ room }: { room: "board" | "epics" | "matrix" }) {
  const { user } = useAuth();
  const work = useWorkspace(user?.id ?? lastUser());
  const board = useTodayBoard();
  const actions = useWorkActions(work);
  return (
    <RoomShell room={room} board={board} offline={actions.offline}>
      {!work ? <RoomSkeleton room={room} />
        : room === "board" ? <Kanban work={work} actions={actions} />
        : room === "epics" ? <Epics work={work} actions={actions} />
        : <Matrix work={work} actions={actions} />}
    </RoomShell>
  );
}

// Stats, All tasks and the Calendar: the whole account. All tasks edits through the Board's actions (a task's ticket, as there).
function AccountRoom({ room }: { room: "stats" | "tasks" | "tidy" | "calendar" }) {
  const board = useTodayBoard();
  const all = useEverything();
  const work = useMemo(() => all && { today: all.today, epics: all.epics, tasks: all.tasks, done_counts: {} }, [all]);
  const actions = useWorkActions(work);
  return (
    <RoomShell room={room} board={board} offline={actions.offline}>
      {!all ? <main className="room-main is-loading" aria-busy><div className="room-head"><span className="skel skel-line" style={{ width: 120, height: 26 }} /></div></main>
        : room === "stats" ? <Stats all={all} /> : room === "calendar" ? <CalendarRoom all={all} actions={actions} /> : room === "tidy" ? <Tidy all={all} actions={actions} /> : <AllTasks all={all} actions={actions} />}
    </RoomShell>
  );
}

function Rooms({ cached }: { cached?: string }) {
  const [room] = useRoute();
  // Back from signing in (AuthKit returns to /callback) with a share still waiting: take it up.
  useEffect(() => {
    if (room !== "share" && pendingShare()) go("share");
  }, [room]);
  if (room === "share" || room === "settings" || room === "suggested") return <SideRoom key={room} room={room} />;
  if (room === "stats" || room === "tasks" || room === "tidy" || room === "calendar") return <AccountRoom key={room} room={room} />;
  return room === "day" ? <Home cached={cached} /> : <WorkRoom key={room} room={room} />;
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
      {kept ? <Hero board={kept} /> : <HeroShell />}
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

// A cold start: while sign-in is still being checked, the last signed-in person's kept board shows at once (and
// on its own if there is no network to sign in with), so opening the app is never a blank wait. Once auth
// resolves, the Authenticated path takes over with live data.
function ColdStart({ children, waiting = false }: { children: ReactNode; waiting?: boolean }) {
  const offline = useOffline();
  const last = lastUser();
  return (waiting || offline) && last && hasCachedBoard(last) ? <Guard cached={last}><Rooms cached={last} /></Guard> : <>{children}</>;
}

function SignIn() {
  const { signIn } = useAuth();
  return <Door onSignIn={() => void signIn()} />;
}

export function App() {
  if (new URLSearchParams(window.location.search).get("fixture") === "1") return <FixtureHero />;
  return (
    <>
      <AuthLoading><ColdStart waiting><HeroShell /></ColdStart></AuthLoading>
      <Unauthenticated><ColdStart><SignIn /></ColdStart></Unauthenticated>
      <Authenticated><Guard><Rooms /></Guard></Authenticated>
    </>
  );
}
