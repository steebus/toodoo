import { useCallback, useEffect, useState } from "react";

const isRealDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && new Date(d + "T00:00:00Z").toJSON()?.slice(0, 10) === d;

const setParam = (d: string | undefined) => {
  const url = new URL(window.location.href);
  if (d) url.searchParams.set("date", d);
  else url.searchParams.delete("date");
  window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
};

// Only a real calendar day counts; anything else (2026-02-31, junk) means today, and the URL is cleaned.
const read = () => {
  const d = new URLSearchParams(window.location.search).get("date");
  if (d === null) return undefined;
  if (isRealDate(d)) return d;
  setParam(undefined);
  return undefined;
};

// The viewed day lives in ?date= so a reload stays on it; no param means today.
export function useViewDate() {
  const [date, setDate] = useState(read);
  useEffect(() => { // openDay, or the browser's back and forward, moved ?date= under us
    const sync = () => setDate(read());
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  const go = useCallback((d: string | undefined) => {
    setParam(d);
    setDate(d);
  }, []);
  return [date, go] as const;
}

// Take the app to a day on the main screen, from wherever it is (a new history entry; Back returns).
export function openDay(date: string, today: string) {
  window.history.pushState(null, "", date === today ? "/" : `/?date=${date}`);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
