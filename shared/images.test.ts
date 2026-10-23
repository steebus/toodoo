import { expect, it } from "vitest";
import { decodeImage } from "./images.ts";

const PNG = "iVBORw0KGgo="; // the PNG signature

it("decodes bare base64 and data URLs, sniffing the type", () => {
  const a = decodeImage({ data: PNG }, 0);
  expect(a).toMatchObject({ type: "image/png", name: "screenshot-1.png" });
  const b = decodeImage({ data: `data:image/jpeg;base64,${PNG}`, name: "after.jpg" }, 1);
  expect(b).toMatchObject({ type: "image/jpeg", name: "after.jpg" });
  expect("bytes" in a && a.bytes[1]).toBe(0x50);
});
it("refuses what is not a picture", () => {
  expect(decodeImage({ data: "!!!" }, 0)).toHaveProperty("error");
  expect(decodeImage({ data: btoa("hello world") }, 0)).toHaveProperty("error");
  expect(decodeImage({}, 2)).toEqual({ error: "image 3: data must be base64" });
});
