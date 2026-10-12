type Props = { date: string; headline: string; done: number; total: number; presets: string[]; activePreset: string };

export function TopBar({ date, headline, done, total, presets, activePreset }: Props) {
  return (
    <header className="topbar">
      <p className="r-wordmark wordmark">toodoo</p>
      <h1 className="r-date date">{date}</h1>
      <p className="r-headline headline">{headline}</p>
      <p className="r-progress progress">
        <span>{`${done} of ${total} done`}</span>
      </p>
      <span className="topbar-sep" aria-hidden />
      <nav className="r-presets presets" aria-label="Mode">
        {presets.map((p, i) => (
          <span key={p} className="preset-slot">
            {i > 0 && <span className="preset-dot" aria-hidden>·</span>}
            <button type="button" className="preset" aria-pressed={p === activePreset}>
              {p}
            </button>
          </span>
        ))}
      </nav>
      <div className="r-topbar-rule topbar-rule" aria-hidden />
    </header>
  );
}
