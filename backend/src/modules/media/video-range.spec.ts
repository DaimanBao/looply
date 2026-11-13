import { describe, expect, it } from "vitest";
import { videoRange } from "./video-range";

describe("private video byte ranges", () => {
  it("handles full, exact, open, suffix and oversized integer ranges without rounding", () => {
    expect(videoRange(undefined, 100)).toEqual({ start: 0, end: 99, partial: false });
    for (const [value, start, end] of [
      ["bytes=0-0", 0, 0],
      ["bytes=20-", 20, 99],
      ["bytes=-10", 90, 99],
      ["bytes=-99999999999999999999999999999", 0, 99],
      ["bytes=90-999999999999999999999999999", 90, 99],
    ] as const)
      expect(videoRange(value, 100)).toEqual({ start, end, partial: true });
  });
  it.each([
    "bytes=-0",
    "bytes=100-",
    "bytes=5-4",
    "bytes=",
    "bytes=-",
    "bytes=0-1,2-3",
    "items=0-1",
    "bytes=1.2-5",
    "bytes=999999999999999999-",
    "x".repeat(129),
  ])("rejects malformed or unsatisfiable %s", (header) => {
    expect(() => videoRange(header, 100)).toThrowError(
      expect.objectContaining({ status: 416, code: "INVALID_RANGE" }),
    );
  });
});
