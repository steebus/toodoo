---
name: toodoo
description: A day planner drawn as a kitchen expo pass; tasks are thermal-paper dockets on flat 2D ticket rails beside a timeline, marked up in biro.
colors:
  ground: "#fcfcfc"
  surface: "#ffffff"
  well: "#f6f6f6"
  well-strong: "#e8e8e8"
  ink: "#111111"
  ink-2: "#3c3c3c"
  ink-3: "#5f5f5f"
  rule: "#c4c4c4"
  rule-soft: "#dcdcdc"
  rule-dash: "#cfcfcf"
  docket-red: "#d7261e"
  docket-red-ink: "#b3161b"
  docket-red-soft: "#f2d4d2"
  bump-green: "#1e8a4c"
  paper-ink: "#121212"
  paper: "#fbfbf8"
  dark-ground: "#161616"
  dark-surface: "#1e1e1e"
  dark-ink: "#f0f0f0"
typography:
  wordmark:
    fontFamily: "Carlito, Calibri, system-ui, sans-serif"
    fontSize: "37px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.01em"
  date:
    fontFamily: "RocknRoll One, Carlito, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "-0.01em"
  panel-title:
    fontFamily: "Carlito, Calibri, system-ui, sans-serif"
    fontSize: "27px"
    fontWeight: 700
    lineHeight: 1
  section-label:
    fontFamily: "Carlito, Calibri, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.01em"
  ui:
    fontFamily: "Carlito, Calibri, system-ui, sans-serif"
    fontSize: "21px"
    fontWeight: 400
    lineHeight: 1
  print-title:
    fontFamily: "Iosevka Charon Mono, ui-monospace, monospace"
    fontSize: "21.5px"
    fontWeight: 700
    lineHeight: 1
  print:
    fontFamily: "Iosevka Charon Mono, ui-monospace, monospace"
    fontSize: "16.5px"
    fontWeight: 400
    lineHeight: 1
    fontFeature: "tabular-nums"
  print-small:
    fontFamily: "Iosevka Charon Mono, ui-monospace, monospace"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1
rounded:
  sm: "2px"
  md: "4px"
  lg: "5px"
  full: "50%"
spacing:
  space-1: "4px"
  space-2: "8px"
  space-3: "12px"
  space-4: "20px"
  space-5: "28px"
components:
  plan-block-task:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.print}"
    rounded: "{rounded.md}"
    padding: "0 0 0 19px"
  plan-block-event:
    backgroundColor: "{colors.well-strong}"
    textColor: "{colors.ink}"
    typography: "{typography.print}"
    rounded: "{rounded.md}"
  docket-today:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.paper-ink}"
    typography: "{typography.print-title}"
    rounded: "{rounded.sm}"
    padding: "0 26px 0 19px"
  docket-today-high:
    textColor: "{colors.docket-red-ink}"
  chip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-2}"
    typography: "{typography.print}"
    rounded: "{rounded.md}"
    padding: "0 14px 0 13px"
  chip-high:
    textColor: "{colors.docket-red-ink}"
  quickadd-input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.print}"
    rounded: "{rounded.md}"
    padding: "0 19px"
  nextup-box:
    backgroundColor: "{colors.well}"
    rounded: "{rounded.lg}"
  button-save:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "9px 16px"
  count-chip:
    backgroundColor: "{colors.well-strong}"
    typography: "{typography.print-small}"
    rounded: "{rounded.md}"
---

# Design System: toodoo

## Overview

**Creative North Star: "The Pass"**

The day is a working kitchen pass. Tasks are paper dockets that come up on a ticket rail, get fired onto the line (the timeline) at a time, and are bumped when done. The ground is white and near-white, the ink is near-black, and the only colours are the signals a kitchen would use: docket red for what is high priority or carried over, bump green for done. Everything that is a time, a duration or a count is set in a tabular monospace, as if printed by a ticket machine.

The system is a measured reproduction of one approved comp: type sizes and positions come from it (the rails and paper, once raster plates, are now drawn in CSS). The whole frame is one scaled stage. Sizes are written as comp pixels multiplied by one unit (`--u`, at most 1px, shrinking with windows narrower than 1536 or shorter than 900), so a small window is the comp in miniature, never a reflow. Under 820px the same pieces re-lay as one room at a time (Today or Plan) with bottom tabs.

Density is calm: a thin chrome of hairlines and dashed hour lines, with the colourful and tactile material reserved for dockets and rails.

**Key Characteristics:**
- Near-monochrome ground; red and green are signals, never decoration.
- Dockets are thermal paper drawn in CSS (a perforated top, a flat offset shadow) with live type printed on top; rails are flat 2D bars, outlined, with a highlight, a shade and bolts, like a game's.
- The hand is biro (`--biro`): the top pick's ring, the bump's loop and tick, the strike through done work and the progress line are all pen marks on the paper.
- Mono for every time, duration, count and print line; a humanist sans for chrome labels.
- Hairline rules and dashed hour lines; soft, small shadows only.
- Motion is a first-class feature, built on one shared spring and always paired with a reduced-motion fallback.

## Colors

Strategy: restrained neutral with two functional signals. Light is the default; a dark theme mirrors the neutrals and lifts the signals for contrast (`data-theme="dark"` or the system preference).

### Primary
- **Docket Red** (see `docket-red`): the now-line, the insertion caret, the "!" in the high chip, error borders. Its printed-on-paper twin is **Docket Red Ink** (`docket-red-ink`), used for high-priority and carried docket text, the high chip, delete and error text.
- **Docket Red Soft** (`docket-red-soft`): text selection, the high chip border, the warm flush on newly arrived dockets.

### Secondary
- **Bump Green** (`bump-green`): plan-block ticks, the day's progress fill, the swipe-to-bump under a phone stub.
- **Biro** (`--biro`, #2c4fa3): the hand, not a signal. Pen marks on paper only: the top pick's ring, a docket's bump loop and scrawled tick, the wavy strike through done titles, and the time-spent line (which turns Docket Red Ink past the estimate). Like the paper, it never inverts.

### Neutral
- **Ground** (`ground`) and **Surface** (`surface`): the page and raised controls (inputs, task blocks, sheets).
- **Well** (`well`) and **Well Strong** (`well-strong`): recessed areas (Next up box, events, count chips, panel divider).
- **Ink** (`ink`), **Ink 2**, **Ink 3**: primary text, secondary text, quiet text and done/disabled state. Ink 3 is the floor for readable secondary text.
- **Rule**, **Rule Soft**, **Rule Dash**: control borders, panel hairlines, dashed hour lines.
- **Paper** (`paper`) and **Paper Ink** (`paper-ink`): the thermal stock and its print. Dockets are paper in both themes, so their ink does not invert in dark mode.

### Named Rules
**The Signal Rule.** Red means high priority, carried over, now, or error; green means done. Neither colour appears as decoration, and neither is used for a plain action.

**The Paper Never Inverts Rule.** Anything that is a printed slip (dockets, the bumped slip) keeps paper and print colours in both themes; only the room around it changes.

## Typography

**Display Font:** none; the date line uses RocknRoll One (with Carlito) as a single character note.
**Body Font:** Carlito (with Calibri, system-ui), a humanist sans for wordmark, panel titles, section labels, presets and the headline.
**Label/Mono Font:** Iosevka Charon Mono (self-hosted via fontsource; weights 300, 400, 500, 700) for all print: times, durations, counts, chips, quick add, docket text, sheets, toasts, help.

**Character:** a plain sans for the room, a ticket-printer mono for everything that is on paper or a number. Both are self-hosted; no system display face is used.

### Hierarchy
- **Wordmark** (700, 37px, 1): the lower-case "toodoo", once, top left.
- **Date** (400, 22px, 1): the day, centred in the top bar.
- **Panel title** (700, 27px, 1): "Day plan", "To do", sheet titles.
- **Section label** (700, 17px, 1, +0.01em): rail group names (Carried over, Today, Coming up) and the Next up label, each with a count chip.
- **Print title** (mono 700, ~21px): docket titles, set in capitals as printed on the paper (carried 20px).
- **Print** (mono 400, 15 to 21px): the working size for times, plan blocks, chips, input and meta lines.
- **Small print** (mono 400, 13 to 15px): reasons, durations, counts, why-lines.
- Hour labels are mono 300 at 19px; every numeral is tabular.

### Named Rules
**The Mono-For-Numbers Rule.** Any time, duration, count or span is set in the print mono with tabular figures. Words that label them stay in the sans.

**The Printed Capitals Rule.** Capitals are used where the paper would print them: docket titles and the field names on a docket. They are not a style for UI labels elsewhere.

## Layout

One full-viewport frame (`100dvh`, no page scroll) with a top bar and two panes: Day plan on the left (about 34%) and To do on the right (the rest). The split is a single custom property (`--split`, default 33.85) driven by a draggable, keyboard-focusable divider grip and animated on release; everything on the To do side scales from what is left. The top bar carries the wordmark, the date and headline centred, the "n of m done" count with a green progress hairline, and the three presets Capture, Plan, Focus (Focus narrows the list to a column of one-line docket stubs).

Day plan is a 7am to 6pm timeline of dashed hour lines with mono labels, event and task blocks in lanes, and a red now-line. Next up (three lines and Plan all) heads the Day plan, above the line. The To do pane stacks: quick add and parsed chips, then rails (Carried over, Today, Done today and Coming up, the last two folding), each group's dockets wrapping onto rails stacked downward. Spacing steps are 4, 8, 12, 20, 28px in the token set; most spacing in the build is measured comp px rather than that scale, so new work should use the scale for gaps and the unit (`--u`) for anything sized.

Breakpoint: below 820px the unit is a fixed 1px, the header regroups, Plan and Today become two rooms that slide past each other under bottom tabs (spring, 0.6s), Next up sits at the head of the Plan room, rails become a thin 2D bar with compact stub dockets that swipe (bump on the left, Plan / Tomorrow on the right), and a round add button floats at the thumb corner.

## Elevation & Depth

Flat with a tonal step: white controls on a near-white ground, recessed wells for secondary areas, and hairlines for edges. The two material layers are the rails and the paper dockets, both drawn in CSS: rails as flat outlined bars (tokens `--rail-*`, re-toned for dark), paper with teeth that leave the ground showing between them, so both sit right in either theme. Shadows are soft and small, and appear for things that are lifted: controls and blocks at rest (`0 1px 2px rgb(0 0 0 / 0.05)`), popovers (`0 8px 24px / 0.14`), sheets (a 30px spread at 0.14), toasts (`0 8px 24px / 0.22`), a pressed or keyed plan block (`0 6px 16px / 0.16`), and a dragged docket (`0 10px 22px / 0.22` plus a 1.2 degree tilt).

### Named Rules
**The Lifted-Only Rule.** Beyond the 1px resting hint on controls, a shadow means the thing is above the surface right now (open, held, dragged, or arriving).

## Shapes

Small, square-ish radii: 4px on controls, blocks, chips and inputs; 5px on the Next up box; 2px on dockets and the paper print; full circles for bump and tick controls and the add button on phone. Edges are 1px hairlines in Rule or Rule Soft. Dockets have a sawtooth perforated top and stand on their rail; the top pick carries one hand-drawn blue biro ring wider than its docket. Dashed borders mean provisional (the drop target, the slot cursor, the drag ghost).

## Components

### Docket
The signature piece. CSS paper with live mono print on it, standing on a rail; a group's dockets wrap onto as many rails as they need, stacked down the To do side (a repeating background draws one rail per row), never scrolling sideways. Today dockets show time and duration, a bold capitalised title, source, a dashed rule, then START / DURATION / EPIC / TAGS rows. Carried dockets lead with "n DAYS" in red, then title, then DUE / EPIC / DURATION. The title takes the paper's spare room and a long one prints smaller on more lines (`fit-1`, `fit-2`) rather than being cut off. High priority (the task's own, as its epic lifts or sinks it) prints in Docket Red Ink. The top pick has the biro ring. The bump is a pen loop in the corner (on hover or focus, always on touch) that ticking scrawls a biro tick through; done dockets go quiet with a wavy biro strike. A task with an estimate and time spent carries a pen line along its foot. The title opens the task's ticket.

### Ticket
A task, read: a side sheet (bottom sheet on the phone) of the same paper with a perforated edge, printing when, time and estimate, the title, flags, epic, time spent, description, note, link and tags, with the actions along the foot (Done, Plan it, Tomorrow, the Board's columns, Edit, Delete) as inked paper buttons. Edit opens the edit sheet.

### Plan blocks
Mono, 4px, hairline border. Tasks are white; events are Well Strong. The current block takes a 3px ink left edge. Tick and unplan appear over the block's right end on hover (tap on touch). Blocks drag, resize from the bottom edge, and take keys. Empty time shows a dashed cursor and opens the slot picker.

### Chips and quick add
One line of mono in a white 4px input, with parsed chips (date, time, priority, estimate) below. The high chip is red. Chips pop in with the spring.

### Buttons
Quiet: white, 1px Rule border, 4px, border darkens to Ink 3 on hover. The one filled button is Save (Ink on Surface). Delete is red text on a red-soft border. Presets are plain text, the active one bold with a 2.5px ink underline.

### Rooms and slips
Beyond the day, the Board and Epics are rooms: pages that flow and scroll in plain px, under a top bar of the wordmark, the room nav (Day · Board · Epics, set like the presets) and Sign out. The room nav also sits in the Pass's top bar, in the open run between the wordmark and the headline. Tasks there are slips: CSS paper (`--paper`, never inverted) with a sawtooth top, mono print and capitalised titles, sitting in recessed wells. A card is a slip with when/estimate, title and an epic/tag foot; a strip is one printed line with a grip and a cross. A well taking a drop goes dashed. An epic's colour (eight muted hues, `--epic-*`, none red or green) is a 3px band down the left of its tasks' dockets, plan blocks and slips: a category at a glance, never a signal. The sign-in screen is one CSS docket fed down onto a 2D rail, printed with the date and time, over a single ink button. Epics are cards in a grid, each with its colour along the top edge. A Light · Dark · Auto switch sits in the View menu and the rooms' top bar.

### Sheets, popovers, toast
Edit sheet is a native dialog, a side sheet from the right (440px) on desktop and a bottom sheet on phone, with a blurred scrim. The view menu and slot picker are springy popovers. Toast is a dark slip at bottom centre with an undo and a draining ring; an error toast is a white slip with a red hairline.

### Motion
One spring (`--spring`, about 320ms visual, 600ms wall) is shared by CSS and the Web Animations API for sheets, popovers, chips, tab rooms and arriving dockets (feed down onto the rail, warm flush). The split eases at 0.4s, day changes slide as a view transition, the now-line pulses on opacity only, and finishing the last docket feeds a paper slip out of the top-bar rule. Every animation has a `prefers-reduced-motion` fade or none.

## Do's and Don'ts

### Do:
- **Do** size anything on the stage in comp px times `--u`, and take colours from the custom properties.
- **Do** set times, durations and counts in the print mono with tabular figures.
- **Do** keep red and green to their signal meanings.
- **Do** keep dockets as paper with live print on top, and mark them by hand (biro) rather than with UI ticks.
- **Do** give every new animation the shared spring and a reduced-motion fallback.
- **Do** keep a visible focus ring (2px ink, 2px offset) on every control.

### Don't:
- **Don't** replace dockets with card-on-grey list rows, or the rail with a checklist.
- **Don't** invert the paper in dark mode.
- **Don't** add explainer copy; help lives behind the shortcut sheet.
- **Don't** use shadows for decoration at rest.
- **Don't** introduce a third signal colour.

### Not canonized (defects or open items the build carries)
- Glyph characters standing in for icons (the span arrow, the "!" in the high chip, the "x" unplan, the plus in the slot picker): the build ships them, but they are not a pattern for new surfaces; draw real icons.
- The slashed zero in Iosevka Charon Mono is the build as shipped; whether to switch to plain zeros is an open decision with the product owner.
- Hard-coded off-system greys on compact dockets (`#5f5f5f` duration, `#dedede` border) and the `!important` overrides on the add and divider buttons.
- The generated scaffold file `styles/layout.css` (percent-of-frame positions) is plumbing, not a token set.
