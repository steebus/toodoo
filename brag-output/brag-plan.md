# toodoo: launch video plan

**What it is:** a day planner drawn as a kitchen expo pass, fed every morning by Claude.
**Who it's for:** a developer juggling Jira, email and family calendars, planning their own day.
**What sets it apart:** tasks are thermal-paper dockets on ticket rails. You fire them onto a timeline and bump them with a biro tick. Claude drops the morning's tasks in at 6:30 and plans with the same rules the UI uses.
**Visual hook:** dockets printing down onto a steel rail, with the heat-flush blush and a printer "zzt".
**Share caption:** see share-copy.txt

**Tone:** `default`: punchy, playful, clean. Australian voice ("arvo").
**Identity (from tokens.css / pass.css):** ground #fcfcfc, ink #111, docket red #d7261e / #b3161b, biro #2c4fa3, paper #fbfbf8, 2D rails (#2b2d31 outline, #bfc4cb fill, bolts).
Fonts: Carlito (wordmark/UI), Iosevka Charon Mono (print), Caveat (biro hand).
**Reuse:** the real tokens.css and pass.css. Docket, rail, plan-block, chip, quick-add and pen-tick markup mirrors Docket.tsx, NextUp and QuickAdd. The biro-ring plate is used as-is.
**Data:** all task and event names are fictional stand-ins (no real tasks, people or clients).

## Music
120 BPM (one beat = 0.5s, one bar = 2s), A minor / C major. Soft kick, side-stick, hats, round bass and a marimba-ish pluck.
SFX in the same key, on the grid: printer zzt on 16ths for each docket, key clicks on 16ths for typing, soft whooshes for blocks snapping, and a pass bell (A5) on the bump.

## Storyboard (21.0s, every cut on a beat)
| # | Time | Beats | Scene |
|---|---|---|---|
| 1 Hook | 0.0–3.0 | 6 | "06:30 · Claude's morning run". Four dockets print down onto a rail, one per beat, with a heat blush. Line: **Your day, already on the pass.** |
| 2 Reveal | 3.0–6.0 | 6 | Big **toodoo** wordmark, then: **your day planner, run like a kitchen pass.** |
| 3 Capture | 6.0–10.0 | 8 | The ticket-printer quick add types `Call the accountant tomorrow 3pm !high ~30m`. Chips pop on 8ths, Enter, and a red docket prints. Line: **Type it the way you'd say it.** |
| 4 Plan | 10.0–14.5 | 9 | The day timeline with hatched calendar events. **Auto plan** is pressed, then four paper blocks drop into slots on beats around the events. Now-line. Line: **Auto plan fits the work around your calendar.** |
| 5 Bump | 14.5–17.5 | 6 | One docket close up: the pen loop, then the bell and the tick drawn in biro, the title struck through. Line: **Done? Bump it.** |
| 6 Outro | 17.5–21.0 | 7 | **toodoo**: **Plan the day. Work the pass.** Small mono: *fed by Claude at 6:30 every weekday*. |

Transitions: old content out (0.2s), then new content in, dipping through the ground. No crossfades of busy layouts.
