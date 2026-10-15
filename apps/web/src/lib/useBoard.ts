import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { loadBoard, localDate, saveBoard } from "./offline";

// Convex queries are cached, so hand the server a minute-rounded clock to keep "today" fresh.
export function useMinuteTick() {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 60000) * 60000);
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 60000) * 60000), 60000);
    return () => clearInterval(id);
  }, []);
  return now;
}

// The last answer, kept while the next one (new clock, same question) is on its way, so a tick never blanks the screen.
export function useHeld<T>(value: T | undefined, key: string): T | undefined {
  const held = useRef<{ key: string; value: T } | null>(null);
  if (value !== undefined) held.current = { key, value };
  return value ?? (held.current?.key === key ? held.current.value : undefined);
}

export function useBoard(date?: string, userId?: string) {
  const now = useMinuteTick();
  const live = useHeld(useQuery(api.agent.board, date ? { date, now } : { now }), date ?? "");
  useEffect(() => {
    if (live && userId) saveBoard(userId, live.date, live);
  }, [live, userId]);
  // Nothing from the server yet (a cold start, sign-in still being checked, back from the background with the
  // socket still coming up, or a day just asked for): the last board kept for that day, at once, with the clock
  // brought up to date. Live data replaces it as soon as it lands.
  const kept = useMemo(() => {
    if (live !== undefined || !userId) return undefined;
    const b = loadBoard(userId, date ?? localDate());
    const t = new Date();
    return b && { ...b, today: localDate(t), nowM: t.getHours() * 60 + t.getMinutes() };
  }, [live, userId, date]);
  return live ?? kept;
}
