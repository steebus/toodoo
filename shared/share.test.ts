import { describe, expect, it } from "vitest";
import type { Epic } from "./epics.ts";
import { cleanUrl, deadlineIn, estimateIn, priorityIn, readShare } from "./share.ts";

const T = "2026-10-13"; // a Tuesday
const epic = (id: string, title: string, o: Partial<Epic> = {}): Epic =>
  ({ id, title, description: null, priority: null, status: "active", sort_order: 0, ...o });
const epics = [epic("c", "Crooz"), epic("w", "Website relaunch"), epic("old", "Performance", { status: "done" })];

describe("readShare", () => {
  it("reads a Jira issue: key, summary, a link to the issue, idempotent on the key", () => {
    const r = readShare({ url: "https://acme.atlassian.net/browse/CROOZ-293?atlOrigin=abc", title: "[CROOZ-293] Bulk performance testing - Jira" }, T, epics);
    expect(r.task).toMatchObject({
      title: "CROOZ-293 Bulk performance testing", source: "jira", external_id: "jira:CROOZ-293", tags: ["work"],
      link: "https://acme.atlassian.net/browse/CROOZ-293", epic_id: "c",
    });
    expect(r.found).toEqual(["Jira CROOZ-293", "epic Crooz"]);
  });
  it("finds the key on a board with the issue open", () => {
    const r = readShare({ url: "https://acme.atlassian.net/jira/software/projects/CROOZ/boards/1?selectedIssue=CROOZ-12", title: "Board - Jira" }, T);
    expect(r.task.external_id).toBe("jira:CROOZ-12");
  });
  it("reads a Gmail thread's subject and id", () => {
    const r = readShare({ url: "https://mail.google.com/mail/u/0/#inbox/FMfcgzQXJWDsKmlpGhTqgBQnRw", title: "Invoice overdue - urgent - someone@example.com - Gmail" }, T);
    expect(r.task).toMatchObject({ title: "Invoice overdue - urgent", source: "email", external_id: "gmail:FMfcgzQXJWDsKmlpGhTqgBQnRw", priority: "high" });
  });
  it("takes plain shared words: first line the title, the rest the description, a link found in it", () => {
    const r = readShare({ text: "Book the venue for the website relaunch party\nThey need it by Friday, no rush on catering.\nhttps://venue.example.com/book?utm_source=x" }, T, epics);
    expect(r.task).toMatchObject({
      title: "Book the venue for the website relaunch party", link: "https://venue.example.com/book", due: "2026-10-16", epic_id: "w",
    });
    expect(r.task.description).toContain("by Friday");
    expect(r.found).toContain("due by friday");
  });
  it("lets the quick add's words in a title do their thing", () => {
    expect(readShare({ text: "Call the plumber tomorrow 3pm !high ~30m" }, T).task)
      .toMatchObject({ title: "Call the plumber", due: "2026-10-14", time: "15:00", priority: "high", estimate_mins: 30 });
  });
  it("drops a short site name off a page title, and never matches a done epic", () => {
    const r = readShare({ url: "https://example.com/post", title: "Performance budgets explained | Example Blog" }, T, epics);
    expect(r.task).toMatchObject({ title: "Performance budgets explained", epic_id: null, source: "you" });
  });
});

describe("clues in running text", () => {
  it("only takes a weekday as a deadline when the words say so", () => {
    expect(deadlineIn("On Monday we talked about it", T)).toBeNull();
    expect(deadlineIn("Please have it done by Monday", T)?.due).toBe("2026-10-19");
    expect(deadlineIn("due today", T)?.due).toBe(T);
    expect(deadlineIn("deadline: 2026-11-03", T)?.due).toBe("2026-11-03");
    expect(deadlineIn("Tickets on sale 22 October", T)?.due).toBe("2026-10-22");
    expect(deadlineIn("Was due 1 Oct", T)?.due).toBe("2026-10-01");
    expect(deadlineIn("Book flights by 5 Jan", T)?.due).toBe("2027-01-05");
  });
  it("reads priority words", () => {
    expect(priorityIn("This is URGENT")?.priority).toBe("high");
    expect(priorityIn("Priority: Medium")?.priority).toBe("med");
    expect(priorityIn("no rush")?.priority).toBe("low");
    expect(priorityIn("a plain note")).toBeNull();
  });
  it("reads an estimate only when it is called one", () => {
    expect(estimateIn("should take about 2 hours")).toBe(120);
    expect(estimateIn("Estimate: 45m")).toBe(45);
    expect(estimateIn("we have 3 hours of meetings")).toBeNull();
  });
  it("cleans tracking off links and refuses anything but the web", () => {
    expect(cleanUrl("https://x.com/a?utm_source=y&id=2")).toBe("https://x.com/a?id=2");
    expect(cleanUrl("javascript:alert(1)")).toBeNull();
  });
});
