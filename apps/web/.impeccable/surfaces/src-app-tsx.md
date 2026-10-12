---
version: 1
slug: "src-app-tsx"
primary_target: "src/App.tsx"
related_targets: []
---

# toodoo app — surface brief

Scope: the whole authenticated app shell (header, Day plan panel, To do panel, presets, sheets, mobile tabs). Mode: Operate.

Audience/job: Steve, bright daytime desk; capture → plan → focus each day; phone for checking and ticking.
Constraints: the spec's functionality list and UI/motion sections; little to no explainer text; light-first with a dark theme.
Approved comp: .impeccable/mocks/comp-1.png (decision comp of the assigned direction, approved by Steve).
Readability steer: Steve likes the category standard's instant readability alongside The Pass's novelty, but chose comp-1 as the north star; readability is honoured within comp-1's grammar (legible sizes, contrast, scan order), never by swapping its docket type for list rows.

## Direction contract

THESIS: The day as a working kitchen pass: tasks are paper dockets that come up on a steel rail, get fired onto the line at a time, and are bumped when done. Refuses the card-on-grey SaaS list and the Things/Todoist checklist.
OWN-WORLD: White and pale brushed-stainless ground, near-black ink, docket red #D7261E for high/carried, bump green #1E8A4C; thermal-paper dockets with perforated tops in condensed caps titles; tabular mono for every time, duration and count; steel ticket rails; one blue biro ring on the top pick.
STORY: Steve sees today's shape (headline, events, planned dockets), what's carried and what's next, adds by typing one line, fires dockets onto the line, bumps them as he goes.
FIRST VIEWPORT: Top bar (wordmark, date + headline centred, "3 of 9 done", Capture·Plan·Focus). Left ~33%: Day plan timeline 7am–6pm with events, task blocks, red now-line. Right ~67%: To do: span "10:00 → 3:00", quick-add with parsed chips, Next up strip of three, Carried over rail, Today rail of dockets (top pick ringed), Coming up collapsed.
FORM: The Pass (kitchen expo pass/ticket rail), my list position 3, seed key 953035aa.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
