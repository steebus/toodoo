import { createContext, useContext, useState, type ReactNode } from "react";
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
import { SkeletonTicket } from "./Hero";

type Props = { room: Room; board?: BoardData; offline?: boolean; onSignOut?: () => void; children: ReactNode };

const PRESETS = ["Plan", "Capture"];

// The Board or Epics before their data comes: the page's own shape (lanes of blank tickets, or epic cards),
// shimmering, so the data fills in rather than jumps in.
export function RoomSkeleton({ room }: { room: "board" | "epics" | "matrix" }) {
  return (
    <main className={`room-main is-loading ${room === "board" ? "kanban" : room}`} aria-busy>
      <div className="room-head"><span className="skel skel-line" style={{ width: 120, height: 26 }} /></div>
      {room === "matrix" ? (
        <div className="mx-frame"><div className="mx-plot" /></div>
      ) : room === "board" ? (
        <div className="kanban-cols">
          {[3, 1, 1, 2].map((n, c) => (
            <section key={c} className="kanban-col">
              <span className="skel skel-line" style={{ width: 90, height: 16, marginBottom: 12 }} />
              <ol className="lane skel-lane">{Array.from({ length: n }, (_, i) => <li key={i} className="slip slip-card"><span className="skel skel-line" style={{ width: "40%" }} /><span className="skel skel-line" style={{ width: "85%" }} /><span className="skel skel-line" style={{ width: "60%" }} /></li>)}</ol>
            </section>
          ))}
        </div>
      ) : (
        <div className="epic-list">
          {[0, 1, 2].map((i) => (
            <section key={i} className="epic">
              <div className="epic-head"><span className="skel skel-line" style={{ width: "45%", height: 20 }} /></div>
              <div className="epic-body"><ol className="lane tickets">{[0, 1, 2].map((k) => <SkeletonTicket key={k} />)}</ol></div>
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
const OWN_CORNER: Room[] = ["board", "epics", "matrix"];

// The Board, Epics, Matrix and Share rooms: the Day view's own header row (today's date and line, then Focus and
// the presets, or the room's own controls), then a page that scrolls. A preset or Focus goes to the Day view.
export function RoomShell({ room, board, offline, onSignOut, children }: Props) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const model = board ? buildPass(board, DEFAULT_VIEW) : null;
  const split = loadSplit();
  const active = PRESETS.find((p) => Math.abs(PRESET_SPLIT[p] - split) < 0.5) ?? "";
  const block = board ? focusBlock(board) : null;
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
            onPreset={(p) => { saveSplit(PRESET_SPLIT[p]); go("day"); }}
            onFocus={block ? () => { focusIntent.at = Date.now(); go("day"); } : undefined}
            onSignOut={onSignOut}
            offline={offline}
            end={OWN_CORNER.includes(room) ? <div className="topbar-slot" ref={setSlot} /> : undefined}
          />
        </div>
      </div>
      {/* motion for the pages too: the ticket's pen tick, the Matrix's dots */}
      <MotionRoot><HeaderSlot value={slot}>{children}</HeaderSlot></MotionRoot>
    </div>
  );
}
