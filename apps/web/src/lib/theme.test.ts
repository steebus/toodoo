import { beforeEach, expect, it } from "vitest";
import { applyTheme, loadTheme, setTheme } from "./theme";

beforeEach(() => { localStorage.clear(); applyTheme("auto"); });

it("keeps light or dark on this device, and auto follows the system", () => {
  expect(loadTheme()).toBe("auto");
  setTheme("dark");
  expect(loadTheme()).toBe("dark");
  expect(document.documentElement.dataset.theme).toBe("dark");
  setTheme("auto");
  expect(loadTheme()).toBe("auto");
  expect(document.documentElement.dataset.theme).toBeUndefined();
});

it("tells the browser which scheme to draw its own parts in", () => {
  const meta = document.createElement("meta");
  meta.name = "color-scheme";
  meta.content = "light dark";
  document.head.append(meta);
  setTheme("light");
  expect(meta.content).toBe("light");
  setTheme("auto");
  expect(meta.content).toBe("light dark");
  meta.remove();
});
