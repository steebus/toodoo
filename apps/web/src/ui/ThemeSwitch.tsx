import { useTheme, type Theme } from "../lib/theme";
import { AutoIcon, MoonIcon, SunIcon } from "./icons";

const OPTIONS: [Theme, string, typeof SunIcon][] = [["light", "Light", SunIcon], ["dark", "Dark", MoonIcon], ["auto", "Auto", AutoIcon]];

// Light · Dark · Auto: three small icon buttons, one pressed.
export function ThemeSwitch({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useTheme();
  return (
    <div className={`theme-switch ${className}`} role="group" aria-label="Theme">
      {OPTIONS.map(([t, label, Icon]) => (
        <button key={t} type="button" className="theme-opt" aria-pressed={theme === t} aria-label={label} title={label} onClick={() => setTheme(t)}>
          <Icon size={16} />
        </button>
      ))}
    </div>
  );
}
