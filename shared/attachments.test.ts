import { expect, it } from "vitest";
import { fileKind, fileSize, isPicture } from "./attachments.ts";

it("tells pictures from other files", () => {
  expect(isPicture({ type: "image/png" })).toBe(true);
  expect(isPicture({ type: "image/svg+xml" })).toBe(true);
  expect(isPicture({ type: "image/heic" })).toBe(false); // most browsers can't draw it: listed instead
  expect(isPicture({ type: "application/pdf" })).toBe(false);
});

it("prints sizes and kinds as a file manager would", () => {
  expect(fileSize(512)).toBe("512 B");
  expect(fileSize(2048)).toBe("2 KB");
  expect(fileSize(1536)).toBe("1.5 KB");
  expect(fileSize(3.24 * 1024 ** 2)).toBe("3.2 MB");
  expect(fileSize(42 * 1024 ** 2)).toBe("42 MB");
  expect(fileKind("Q3 report.pdf")).toBe("PDF");
  expect(fileKind("data.xlsx")).toBe("XLSX");
  expect(fileKind("notes")).toBe("FILE");
  expect(fileKind("archive.backup")).toBe("FILE");
});
