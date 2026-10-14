import { go, ROOMS, type Room } from "../lib/useRoute";
import { BoardIcon, DayIcon, EpicsIcon, MatrixIcon } from "./icons";
import "./rooms.css";

const ICON: Partial<Record<Room, typeof DayIcon>> = { day: DayIcon, board: BoardIcon, epics: EpicsIcon, matrix: MatrixIcon };

// The rooms beside the wordmark, each as a sketch of its screen (named for screen readers and on hover; the
// phone's bar prints the name under it). Real links, so a middle click or a new tab still works.
export function RoomNav({ room }: { room: Room }) {
  return (
    <nav className="rooms" aria-label="Rooms">
      {ROOMS.map((r) => {
        const Icon = ICON[r.room]!;
        return (
        <span key={r.room} className="room-slot">
          <a
            href={r.path}
            className="room-link"
            title={r.label}
            aria-current={r.room === room ? "page" : undefined}
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
              e.preventDefault();
              go(r.room);
            }}
          >
            <Icon className="room-icon" />
            <span className="room-name">{r.label}</span>
          </a>
        </span>
        );
      })}
    </nav>
  );
}
