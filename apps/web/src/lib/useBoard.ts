import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { loadBoard, localDate, saveBoard, useOffline } from "./offline";

// Convex queries are cached, so hand the server a minute-rounded clock to keep "today" fresh.
export function useMinuteTick() {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 60000) * 60000);
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 60000) * 60000), 60000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function useBoard(date?: string, userId?: string) {
  const now = useMinuteTick();
  const live = useQuery(api.agent.board, date ? { date, now } : { now });
  const offline = useOffline();
  useEffect(() => {
    if (live && userId) saveBoard(userId, live.date, live);
  }, [live, userId]);
  // Offline and nothing from the server yet: the last board kept for that real day, with the clock brought up to date.
  const kept = useMemo(() => {
    if (live !== undefined || !offline || !userId) return undefined;
    const b = loadBoard(userId, date ?? localDate());
    const t = new Date();
    return b && { ...b, today: localDate(t), nowM: t.getHours() * 60 + t.getMinutes() };
  }, [live, offline, userId, date]);
  return live ?? kept;
}
