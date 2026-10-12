import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";

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
  return useQuery(api.agent.board, date ? { date, now } : { now });
}
