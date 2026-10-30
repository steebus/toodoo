import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { actionFor, ROOM_KEYS } from "../lib/shortcuts";
import { createPortal } from "react-dom";
import { focusBlock, focusIntent } from "../lib/focus";
import { go, type Room } from "../lib/useRoute";
import { buildPass } from "./build";
import { loadSplit, PRESET_SPLIT, saveSplit } from "./Panes";
import "./pass.css";
import "./rooms.css";
import { MotionRoot } from "./motion";
import { TopBar } from "./TopBar";
import type { BoardData } from "./types";
import { compactDate, longDate } from "./format";
import { DEFAULT_VIEW } from "@shared/board.ts";
import { useNarrow } from "../lib/useNarrow";

type Props = { room: Room; board?: BoardData; offline?: boolean; children: ReactNode };

const PRESETS = ["Plan", "Capture"];

// The Board or Epics before their data comes: the page's own shape (lanes of blank tickets, or epic cards),
// shimmering, so the data fills in rather than jumps in.
export function RoomSkeleton({ room }: { room: "board" | "epics" | "matrix" }) {
  const narrow = useNarrow();
  const slip = (i: number) => <li key={i} className="slip slip-card"><span className="skel skel-line" style={{ width: "40%" }} /><span className="skel skel-line" style={{ width: "85%" }} /><span className="skel skel-line" style={{ width: "60%" }} /></li>;
  return (
    <main className={`room-main is-loading ${room === "board" ? "kanban" : room}`} aria-busy>
      {!narrow && <div className="room-head"><span className="skel skel-line" style={{ width: 120, height: 26 }} /></div>}
      {room === "matrix" ? (
        <div className="mx-frame"><div className="mx-plot" /></div>
      ) : room === "board" && narrow ? (
        // the phone's Board: the five column tabs, the add line, one column
        <>
          <div className="kb-tabs" aria-hidden>
            {[0, 1, 2, 3, 4].map((i) => <span key={i} className="kb-tab"><span className="skel skel-line" style={{ width: "70%" }} /><span className="skel skel-line" style={{ width: 20 }} /></span>)}
          </div>
          <div className="lane-add"><div className="skel-input-line" /></div>
          <div className="kanban-cols"><section className="kanban-col"><ol className="lane skel-lane">{[0, 1, 2].map(slip)}</ol></section></div>
        </>
      ) : room === "board" ? (
        <div className="kanban-cols">
          {[3, 1, 1, 2].map((n, c) => (
            <section key={c} className="kanban-col">
              <span className="skel skel-line" style={{ width: 90, height: 16, marginBottom: 12 }} />
              <ol className="lane skel-lane">{Array.from({ length: n }, (_, i) => slip(i))}</ol>
            </section>
          ))}
        </div>
      ) : (
        // Epics open folded: the name, the progress line, a row of tallies
        <div className="epic-list">
          {[0, 1, 2, 3].map((i) => (
            <section key={i} className="epic">
              <div className="epic-head">
                <span className="epic-toggle"><span className="skel skel-line" style={{ width: `${[45, 30, 55, 38][i]}%`, height: 20 }} /></span>
                <div className="epic-meta">
                  <span className="epic-progress"><span className="epic-track" /><span className="skel skel-line" style={{ width: 56 }} /></span>
                  <span className="epic-stats">{[0, 1, 2].map((k) => <span key={k} className="skel skel-line" style={{ width: "70%" }} />)}</span>
                </div>
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}

// The header row's right-hand corner, for a room's own controls (the Board's epic and sort, the Matrix's filters,
// New epic): they render there through a portal, where the Day view has Focus and Plan · Capture.
// Outside a shell (no slot at all) they sit at the head of the page instead.
const HeaderSlot = createContext<HTMLElement | null | undefined>(undefined);
export function HeaderControls({ children }: { children: ReactNode }) {
  const slot = useContext(HeaderSlot);
  if (slot === undefined) return <div className="room-head">{children}</div>;
  return slot && createPortal(children, slot);
}
// The same for the date's place in the header row: the calendar's month picker stands where the date does.
const DateSlot = createContext<HTMLElement | null | undefined>(undefined);
export function DateControls({ children }: { children: ReactNode }) {
  const slot = useContext(DateSlot);
  if (slot === undefined) return <>{children}</>;
  return slot && createPortal(children, slot);
}
const OWN_CORNER: Room[] = ["board", "epics", "matrix", "stats", "calendar"];

// The Board, Epics, Matrix and Share rooms: the Day view's own header row (today's date and line, then Focus and
// the presets, or the room's own controls), then a page that scrolls. A preset or Focus goes to the Day view.
export function RoomShell({ room, board, offline, children }: Props) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [dateSlot, setDateSlot] = useState<HTMLElement | null>(null);
  const model = board ? buildPass(board, DEFAULT_VIEW) : null;
  const split = loadSplit();
  const active = PRESETS.find((p) => Math.abs(PRESET_SPLIT[p] - split) < 0.5) ?? "";
  const block = board ? focusBlock(board) : null;
  const toPreset = (p: string) => { saveSplit(PRESET_SPLIT[p]); go("day"); };
  const focus = block ? () => { focusIntent.at = Date.now(); go("day"); } : undefined;
  // The room keys, and P, C and F (which go to the Day view), work here as they do there.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const a = actionFor(e);
      if (!a || e.defaultPrevented) return;
      if (a in ROOM_KEYS) go(ROOM_KEYS[a as keyof typeof ROOM_KEYS]);
      else if (a === "presetPlan" || a === "presetCapture") toPreset(a === "presetPlan" ? "Plan" : "Capture");
      else if (a === "focus" && focus) focus();
      else return;
      e.preventDefault();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });
  return (
    <div className="room" data-room={room} data-offline={offline || undefined}>
      <div className="room-top">
        <div className="pass pass-top">
          <TopBar
            room={room}
            date={model?.dateLabel ?? longDate(new Date().toLocaleDateString("en-CA"))}
            dateShort={compactDate(board?.date ?? new Date().toLocaleDateString("en-CA"))}
            headline={model?.headline ?? ""}
            total={model?.total ?? 0}
            presets={PRESETS}
            activePreset={active}
            onPreset={toPreset}
            onFocus={focus}
            offline={offline}
            dateSlot={room === "calendar" ? setDateSlot : undefined}
            end={OWN_CORNER.includes(room) ? <div className="topbar-slot" ref={setSlot} /> : undefined}
          />
        </div>
      </div>
      {/* motion for the pages too: the ticket's pen tick, the Matrix's dots */}
      <MotionRoot><HeaderSlot value={slot}><DateSlot value={dateSlot}>{children}</DateSlot></HeaderSlot></MotionRoot>
    </div>
  );
}
