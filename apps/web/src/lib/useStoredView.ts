import { useCallback, useState } from "react";
import { DEFAULT_VIEW, type GroupBy, type SortBy, type View } from "@shared/board.ts";

const KEY = "toodoo.view";
const GROUPS: GroupBy[] = ["status", "column", "priority", "tag", "source", "epic"];
const SORTS: SortBy[] = ["manual", "due", "priority", "time", "tag", "effort"];

// localStorage can be missing, blocked or hold junk: every path falls back to the default view.
export function loadView(): View {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<View> | null;
    return {
      group: GROUPS.includes(raw?.group as GroupBy) ? (raw!.group as GroupBy) : DEFAULT_VIEW.group,
      sort: SORTS.includes(raw?.sort as SortBy) ? (raw!.sort as SortBy) : DEFAULT_VIEW.sort,
      tag: typeof raw?.tag === "string" ? raw.tag : DEFAULT_VIEW.tag,
      ...(typeof raw?.epic === "string" && raw.epic ? { epic: raw.epic } : {}),
    };
  } catch {
    return DEFAULT_VIEW;
  }
}

export function useStoredView(): [View, (v: View) => void] {
  const [view, setView] = useState<View>(loadView);
  const set = useCallback((v: View) => {
    setView(v);
    try {
      localStorage.setItem(KEY, JSON.stringify(v));
    } catch {
      /* storage unavailable: the view still applies for this session */
    }
  }, []);
  return [view, set];
}
