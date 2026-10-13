import { expect, it } from "vitest";
import { keepOnScreen } from "./keepOnScreen";

const rect = (left: number, top: number, w: number, h: number) =>
  ({ left, top, width: w, height: h, right: left + w, bottom: top + h }) as any;
const run = (x: number, y: number) =>
  keepOnScreen({ transform: { x, y, scaleX: 1, scaleY: 1 }, draggingNodeRect: rect(100, 100, 200, 80), windowRect: rect(0, 0, 400, 800) } as any);

it("lets a drag roam inside the window and stops it at the edges", () => {
  expect(run(50, 50)).toMatchObject({ x: 50, y: 50 });
  expect(run(-500, 0)).toMatchObject({ x: -100 });
  expect(run(500, 0)).toMatchObject({ x: 100 });
  expect(run(0, 2000)).toMatchObject({ y: 620 });
  expect(run(0, -2000)).toMatchObject({ y: -100 });
});
