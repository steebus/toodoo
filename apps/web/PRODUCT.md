# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

One user: Steve, planning his own days. He is a developer juggling client work (Jira), email, family calendars and personal tasks. Single-user by design; there is no sharing or team use.

## Product Purpose

toodoo turns a morning's incoming obligations into a realistic day. Tasks arrive from an AI morning agent and from Steve himself; he then shapes them into a time-blocked plan around his calendar and keeps that plan in view while he works. Success is a day where everything that needed doing was seen, sized and placed, and nothing important silently rolled past.

## Positioning

An agent-fed planner. Claude reads, suggests and plans through the same data and the same rules Steve sees in the app: the "what should I do next" ranking and the "plan my afternoon" placement are identical whether they come from the UI or from a chat. Unticked tasks roll over on their own instead of being copied.

## Operating Context

- **The 6:30 run (weekdays):** a scheduled Claude routine reads Google Calendar, Gmail and Jira, writes the day's events and headline, adds tasks, and messages Steve asking what else needs to fit in.
- **The daily ritual, in three stages:**
  1. **Capture:** get tasks in and edit them. The to-do list has priority.
  2. **Plan:** place tasks on the day's timeline around events. List and plan have equal weight.
  3. **Focus:** keep the day plan on screen while working. The plan has priority.
- **Devices:** desktop-first, at a desk during the working day. Phone for checking the plan, ticking things off and quick capture.
- **Other writers:** other apps (e.g. Trippn) add and update tasks via an API, and Claude chats can add, tick or plan.
- **Timezone:** Australia/Brisbane.

## Capabilities and Constraints

- **Tasks:**
  - title, description, note, link, source (you, jira, email, calendar, gtasks, trippn…), due date, time, priority (high/med/low/none), estimate, tags, done/done-on and manual order;
  - carried-over tasks show how many days they've waited;
  - done tasks remain as history.
- **Days:** calendar events (timed and all-day) and a one-line headline written by the agent.
- **Plan:**
  - time blocks on a timeline, 06:00–22:00 by default, with a 15-minute snap;
  - default block length is the remaining estimate, else 60 minutes for high priority and 30 minutes otherwise;
  - overlaps are laid out in lanes;
  - effort tracks planned and actual time against the estimate;
  - day navigation.
- **Epics:** title, description, priority and status (planned, active, on hold, done). A task has at most one epic and keeps its own priority; the epic counts for half of it (a high epic lifts a plain task to medium; on hold sinks it). Managed on the Epics screen: full create/edit/delete, tasks dragged between epics, reordered, or taken out.
- **Board:** a Kanban of To do, Doing, Blocked and Done (the last fortnight), filterable by epic. Doing lifts a task in suggestions; Blocked sinks it.
- **Suggestions:** a scored "next up" list with reasons (overdue, due today, priority, carried from the last plan, estimate already planned, planned elsewhere, fixed time).
- **Stack:** Vite + React + TypeScript + Tailwind v4 web app, Convex backend (live queries), WorkOS AuthKit sign-in, deployed on Vercel, installable as a PWA.

## Brand Commitments

- **Name:** toodoo, lower-case.
- **Voice:** casual, warm, brief, in Australian English.
- **Interface copy:** little to no explainer text. Interactions should explain themselves, with help behind a `?` shortcut sheet.
- **Motion:** Steve values visual flourishes, animation and transitions as part of the experience, not as optional polish (see the spec's Motion & flourishes section).

## Evidence on Hand

- **Real data:** 54 tasks, 13 days of calendar events and headlines, and 2 day plans, imported from the original planner artifact.
- **Spec:** docs/superpowers/specs/2026-10-12-toodoo-pwa-design.md (functionality, UI structure, motion).
- **No marketing assets:** no logo, testimonials or other assets exist; none are needed for this single-user tool.

## Product Principles

1. **The day is the unit.** Everything serves deciding and living today's plan; history and the future support it.
2. **Calm over complete.** Show what matters now and tuck the rest away; density was the old tool's biggest failing.
3. **One truth for human and agent.** What Claude sees, suggests and plans must match what the UI shows.
4. **Nothing is lost silently.** Carry-overs, drops and failures are visible and recoverable (undo, rollover, clear errors).
5. **Delight earns its place.** Motion explains change and rewards progress; it never blocks input.

## Accessibility & Inclusion

- Keyboard-reachable everything, with the shortcuts defined in the spec.
- WCAG AA contrast in light and dark themes.
- `prefers-reduced-motion` swaps movement for fades.
