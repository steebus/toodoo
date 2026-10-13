import type { ReactNode } from "react";
import type { Room } from "../lib/useRoute";
import "./pass.css";
import "./rooms.css";
import { RoomNav } from "./RoomNav";

type Props = { room: Room; offline?: boolean; onSignOut?: () => void; children: ReactNode };

// The Board and Epics rooms: the Pass's wordmark and rule, a page that scrolls, and the same room nav.
export function RoomShell({ room, offline, onSignOut, children }: Props) {
  return (
    <div className="room" data-room={room} data-offline={offline || undefined}>
      <header className="roombar">
        <p className="wordmark">toodoo</p>
        {offline && <span className="room-offline" role="status">offline</span>}
        <RoomNav room={room} />
        {onSignOut && <button type="button" className="roombar-out" onClick={onSignOut}>Sign out</button>}
      </header>
      {children}
    </div>
  );
}
