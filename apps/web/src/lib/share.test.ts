import { beforeEach, expect, it } from "vitest";
import { bookmarklet, clearShare, pendingShare, stashShare } from "./share";

beforeEach(() => sessionStorage.clear());

it("keeps what was shared to /share through sign-in, and only that", () => {
  stashShare({ pathname: "/", search: "?url=https://x.com" });
  expect(pendingShare()).toBeNull();
  stashShare({ pathname: "/share", search: "" });
  expect(pendingShare()).toBeNull();
  stashShare({ pathname: "/share", search: "?url=https%3A%2F%2Facme.atlassian.net%2Fbrowse%2FA-1&title=%5BA-1%5D%20Fix&popup=1" });
  expect(pendingShare()).toEqual({ url: "https://acme.atlassian.net/browse/A-1", title: "[A-1] Fix", popup: true });
  clearShare();
  expect(pendingShare()).toBeNull();
});

it("makes a bookmarklet that opens the share room with the page and its selection", () => {
  const b = bookmarklet("https://toodoo.example");
  expect(b.startsWith("javascript:")).toBe(true);
  expect(b).toContain("https://toodoo.example/share?popup=1&url=");
  expect(b).toContain("getSelection()");
});
