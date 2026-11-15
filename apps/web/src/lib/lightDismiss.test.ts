import { afterEach, describe, expect, it, vi } from "vitest";
import type { MouseEvent } from "react";
import { lightDismiss } from "./lightDismiss";

const box = { left: 100, right: 300, top: 0, bottom: 800 };
const dialog = { getBoundingClientRect: () => box } as unknown as HTMLDialogElement;
const at = (x: number, y: number, target: unknown = dialog) =>
  ({ target, currentTarget: dialog, clientX: x, clientY: y }) as unknown as MouseEvent<HTMLDialogElement>;
const tap = (h: ReturnType<typeof lightDismiss>, down: MouseEvent<HTMLDialogElement>, up = down) => {
  h.onPointerDown(down as never);
  h.onClick(up);
};

afterEach(() => vi.unstubAllGlobals());

describe("lightDismiss (no closedby)", () => {
  it("closes on a tap on the backdrop", () => {
    const close = vi.fn();
    tap(lightDismiss(close), at(20, 20));
    expect(close).toHaveBeenCalledOnce();
  });
  it("keeps it on a tap in the dialog's own empty area, on its content, or a drag out of it", () => {
    const close = vi.fn();
    const h = lightDismiss(close);
    tap(h, at(200, 700));
    tap(h, at(20, 20, {}));
    tap(h, at(200, 300), at(20, 20));
    expect(close).not.toHaveBeenCalled();
  });
  it("keeps it when disabled, and says so to the browser", () => {
    const close = vi.fn();
    const h = lightDismiss(close, false);
    tap(h, at(20, 20));
    expect(close).not.toHaveBeenCalled();
    expect(h.closedby).toBe("closerequest");
    expect(lightDismiss(close).closedby).toBe("any");
  });
  it("leaves it to the browser where closedby works", () => {
    vi.stubGlobal("HTMLDialogElement", class { closedBy = "any"; });
    Object.defineProperty(HTMLDialogElement.prototype, "closedBy", { value: "any", configurable: true });
    const close = vi.fn();
    tap(lightDismiss(close), at(20, 20));
    expect(close).not.toHaveBeenCalled();
  });
});
