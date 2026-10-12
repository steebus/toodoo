import { useCallback, useState } from "react";

const read = () => {
  const d = new URLSearchParams(window.location.search).get("date");
  return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : undefined;
};

// The viewed day lives in ?date= so a reload stays on it; no param means today.
export function useViewDate() {
  const [date, setDate] = useState(read);
  const go = useCallback((d: string | undefined) => {
    const url = new URL(window.location.href);
    if (d) url.searchParams.set("date", d);
    else url.searchParams.delete("date");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    setDate(d);
  }, []);
  return [date, go] as const;
}
