import type { ReactNode } from "react";
import { focusBlock, focusIntent } from "../lib/focus";
import { go, type Room } from "../lib/useRoute";
import { buildPass } from "./build";
import { loadSplit, PRESET_SPLIT, saveSplit } from "./Panes";
import "./pass.css";
import "./rooms.css";
import { TopBar } from "./TopBar";
import type { BoardData } from "./types";
import { longDate } from "./format";
import { DEFAULT_VIEW } from "@shared/board.ts";

type Props = { room: Room; board?: BoardData; offline?: boolean; onSignOut?: () => void; children: ReactNode };

const PRESETS = ["Plan", "Capture"];

// The Board, Epics and Share rooms: the Day view's own header row (today's date and line, Focus, the presets),
// then a page that scrolls. A preset or Focus goes to the Day view and applies there.
export function RoomShell({ room, board, offline, onSignOut, children }: Props) {
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
            headline={model?.headline ?? ""}
            total={model?.total ?? 0}
            presets={PRESETS}
            activePreset={active}
            onPreset={(p) => { saveSplit(PRESET_SPLIT[p]); go("day"); }}
            onFocus={block ? () => { focusIntent.at = Date.now(); go("day"); } : undefined}
            onSignOut={onSignOut}
            offline={offline}
          />
        </div>
      </div>
      {children}
    </div>
  );
}
