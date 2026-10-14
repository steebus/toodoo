import { expect, it } from "vitest";
import { adfText, fromJira, jiraSite, likeness, lookalikes, mergePatch, prepFor, type Mergeable } from "./inbox.ts";

const task = (o: Partial<Mergeable> & { title: string }): Mergeable => ({
  description: null, note: null, link: null, source: "you", external_id: null, due: null, time: null,
  priority: null, estimate_mins: null, tags: [], epic_id: null, ...o,
});

it("finds the task a reworded suggestion means", () => {
  const s = task({ title: "Review Sam's pull request for the billing export" });
  const open = [
    { id: "a", ...task({ title: "Billing export PR review" }) },
    { id: "b", ...task({ title: "Book dentist" }) },
    { id: "c", ...task({ title: "Export photos" }) },
  ];
  expect(lookalikes(s, open).map((x) => x.id)).toEqual(["a"]);
});

it("treats a shared Jira key as a sure match", () => {
  const s = task({ title: "ACME-293 Fix login redirect", external_id: "jira:ACME-293" });
  expect(likeness(s, task({ title: "login thing", link: "https://acme.atlassian.net/browse/ACME-293" }))).toBe(1);
  expect(likeness(s, task({ title: "ACME-29 something else" }))).toBeLessThan(1);
});

it("combines by filling gaps, never overwriting what Steve set", () => {
  const mine = task({ title: "Fix login", due: "2026-10-20", priority: "high", tags: ["work"], checklist: [{ text: "repro", done: true }] });
  const s = task({
    title: "ACME-293 Fix login redirect", source: "jira", external_id: "jira:ACME-293", description: "Users bounce to /",
    link: "https://acme.atlassian.net/browse/ACME-293", due: "2026-10-15", priority: "low", estimate_mins: 90, tags: ["work", "auth"],
    checklist: [{ text: "Repro", done: false }, { text: "Ship", done: false }],
  });
  expect(mergePatch(mine, s)).toEqual({
    description: "Users bounce to /", link: "https://acme.atlassian.net/browse/ACME-293", estimate_mins: 90, tags: ["work", "auth"],
    checklist: [{ text: "repro", done: true }, { text: "Ship", done: false }], source: "jira", external_id: "jira:ACME-293",
  });
  // A task already linked elsewhere keeps its own id; a description already there isn't repeated.
  expect(mergePatch(task({ title: "x", external_id: "gmail:1", description: "Users bounce to /" }), s)).not.toHaveProperty("external_id");
  expect(mergePatch(task({ title: "x", description: "Users bounce to /" }), s)).not.toHaveProperty("description");
});

it("reads a Jira site however it's pasted", () => {
  expect(jiraSite("acme")).toBe("https://acme.atlassian.net");
  expect(jiraSite("https://Acme.atlassian.net/jira/software/projects")).toBe("https://acme.atlassian.net");
  expect(jiraSite("https://evil.example.com")).toBeNull();
});

it("flattens Jira's rich text and lifts its task lists out as steps", () => {
  const doc = {
    type: "doc", content: [
      { type: "paragraph", content: [{ type: "text", text: "Login sends people " }, { type: "text", text: "home." }] },
      { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Chrome" }] }] }] },
      { type: "taskList", content: [
        { type: "taskItem", attrs: { state: "DONE" }, content: [{ type: "text", text: "Repro" }] },
        { type: "taskItem", attrs: { state: "TODO" }, content: [{ type: "text", text: "Fix" }] },
      ] },
    ],
  };
  expect(adfText(doc)).toEqual({ text: "Login sends people home.\n- Chrome", checklist: [{ text: "Repro", done: true }, { text: "Fix", done: false }] });
});

it("maps a Jira issue to a suggestion: effort, priority, status, epic names", () => {
  const s = fromJira({
    key: "ACME-7",
    fields: {
      summary: "Fix login", duedate: "2026-10-20", priority: { name: "Highest" },
      status: { name: "In Review", statusCategory: { key: "indeterminate" } }, timeoriginalestimate: 5400,
      parent: { key: "ACME-1", fields: { summary: "Auth revamp", issuetype: { name: "Epic" } } }, project: { name: "Acme" },
      issuetype: { name: "Bug" },
    },
  }, "https://acme.atlassian.net");
  expect(s).toMatchObject({
    title: "Fix login", source: "jira", external_id: "jira:ACME-7", link: "https://acme.atlassian.net/browse/ACME-7",
    due: "2026-10-20", priority: "high", status: "doing", estimate_mins: 90, tags: ["work"], note: "Acme · Bug",
    epic_names: ["Auth revamp", "Acme"],
  });
  expect(fromJira({ key: "ACME-8", fields: { summary: "x", status: { name: "Triage", statusCategory: { key: "new" } } } }, "https://a.atlassian.net"))
    .toMatchObject({ status: "todo", estimate_mins: null, priority: null });
});

it("makes a prep task keyed to its event", () => {
  expect(prepFor({ date: "2026-10-14", start: "09:15", end: "09:45", title: "Team standup", where: "Zoom" })).toEqual({
    title: "Prep: Team standup", source: "calendar", external_id: "prep:2026-10-14:09:15:team-standup", due: "2026-10-14",
    note: "09:15–09:45 · Zoom", estimate_mins: 15, tags: ["prep"],
  });
});
