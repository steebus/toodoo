import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { loadBoard, saveBoard, useOnline } from "./offline";

// Convex queries are cached, so hand the server a minute-rounded clock to keep "today" fresh.
export function useMinuteTick() {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 60000) * 60000);
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 60000) * 60000), 60000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function useBoard(date?: string) {
  const now = useMinuteTick();
  const live = useQuery(api.agent.board, date ? { date, now } : { now });
  const online = useOnline();
  const key = date ?? "today";
  useEffect(() => {
    if (live) saveBoard(key, live);
  }, [live, key]);
  // Offline and nothing from the server yet: show the last board kept for this day.
  const kept = useMemo(() => (live === undefined && !online ? loadBoard(key) : undefined), [live, online, key]);
  return live ?? kept;
}
