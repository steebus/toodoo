import { useTheme, type Theme } from "../lib/theme";
import { AutoIcon, MoonIcon, SunIcon } from "./icons";

const STEPS: [Theme, string, typeof SunIcon][] = [["light", "Light", SunIcon], ["dark", "Dark", MoonIcon], ["auto", "Auto", AutoIcon]];

// One button that steps through Light, Dark and Auto (the system's), showing the one in use.
export function ThemeCycle() {
  const [theme, setTheme] = useTheme();
  const at = Math.max(0, STEPS.findIndex(([t]) => t === theme));
  const [, label, Icon] = STEPS[at];
  const next = STEPS[(at + 1) % STEPS.length];
  return (
    <button type="button" role="menuitem" className="daymenu-item theme-cycle" onClick={() => setTheme(next[0])}
      aria-label={`Theme: ${label}. Switch to ${next[1]}`}>
      <Icon size={16} /> {label}
    </button>
  );
}
