import { go, ROOMS, type Room } from "../lib/useRoute";
import "./rooms.css";

// Day · Board · Epics, beside the wordmark. Real links, so a middle click or a new tab still works.
export function RoomNav({ room }: { room: Room }) {
  return (
    <nav className="rooms" aria-label="Rooms">
      {ROOMS.map((r, i) => (
        <span key={r.room} className="room-slot">
          {i > 0 && <span className="room-dot" aria-hidden>·</span>}
          <a
            href={r.path}
            className="room-link"
            aria-current={r.room === room ? "page" : undefined}
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
              e.preventDefault();
              go(r.room);
            }}
          >
            {r.label}
          </a>
        </span>
      ))}
    </nav>
  );
}
