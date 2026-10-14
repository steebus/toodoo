import { afterEach, expect, it } from "vitest";
import { actionFor } from "./shortcuts";

const key = (k: string, o: Partial<Parameters<typeof actionFor>[0]> = {}) =>
  actionFor({ key: k, ctrlKey: false, metaKey: false, altKey: false, target: document.body, ...o });

afterEach(() => { document.body.innerHTML = ""; });

it("maps keys to actions", () => {
  expect(key("n")).toBe("add");
  expect(key("j")).toBe("down");
  expect(key("[")).toBe("prevDay");
  expect(key("1")).toBe("presetPlan");
  expect(key("2")).toBe("presetCapture");
  expect(key("f")).toBe("focus");
  expect(key("p")).toBe("presetPlan");
  expect(key("D")).toBe("roomDay");
  expect(key("k")).toBe("roomBoard");
  expect(key("e")).toBe("roomEpics");
  expect(key("m")).toBe("roomMatrix");
  expect(key("?")).toBe("help");
  expect(key("z")).toBeNull();
});

it("ignores modifiers", () => {
  expect(key("n", { ctrlKey: true })).toBeNull();
  expect(key("n", { metaKey: true })).toBeNull();
  expect(key("n", { altKey: true })).toBeNull();
});

it("ignores typing", () => {
  for (const tag of ["input", "textarea", "select"]) {
    expect(key("n", { target: document.createElement(tag) })).toBeNull();
  }
  const ce = document.createElement("div");
  ce.setAttribute("contenteditable", "true");
  document.body.append(ce);
  expect(key("n", { target: ce })).toBeNull();
});

it("ignores keys while a dialog is open", () => {
  const d = document.createElement("dialog");
  d.setAttribute("open", "");
  document.body.append(d);
  expect(key("n")).toBeNull();
});
