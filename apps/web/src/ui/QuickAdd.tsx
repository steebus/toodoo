import { CalendarIcon, ClockIcon } from "./icons";
import type { HeroData } from "./types";

type Props = Pick<HeroData, "quickAdd" | "chips">;

// Static: Task 6 wires the parser (@shared quick-add) and the add mutation.
export function QuickAdd({ quickAdd, chips }: Props) {
  return (
    <form className="quickadd" aria-label="Quick add" onSubmit={(e) => e.preventDefault()}>
      <input
        className="r-quickadd quickadd-input"
        name="line"
        aria-label="New to do"
        autoComplete="off"
        spellCheck={false}
        defaultValue={quickAdd}
      />
      <button type="submit" className="r-add-button add-button">Add</button>
      <ul className="r-chips chips" aria-label="Parsed">
        <li className="chip">
          <CalendarIcon className="chip-icon" />
          {chips.when}
        </li>
        <li className="chip chip-high">
          <span className="chip-bang" aria-hidden>!</span>
          {chips.priority}
        </li>
        <li className="chip">
          <ClockIcon className="chip-icon" />
          {chips.duration}
        </li>
      </ul>
    </form>
  );
}
