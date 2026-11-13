import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decodeMyCursor, encodeMyCursor } from "./listing-cursor";
import { normalizeListingTitle } from "./listing-search";

describe("Listing canonical values and cursor", () => {
  it("normalizes Vietnamese accents, combining marks and whitespace without changing punctuation", () => {
    expect(normalizeListingTitle("  ĐẠP  Xe\nở Hà Nội %_😀 ")).toBe("dap xe o ha noi %_😀");
  });
  it("binds an unsigned continuation to query, viewer and scope and rejects invalid dates/fields", () => {
    const owner = randomUUID();
    const now = new Date("2026-11-13T10:00:00.123Z");
    const query = { limit: 2 };
    const base = decodeMyCursor(query, owner, now);
    const encoded = encodeMyCursor(base, {
      id: randomUUID(),
      createdAt: new Date("2026-11-13T10:00:00.000Z"),
    });
    expect(decodeMyCursor({ ...query, after: encoded }, owner, now).viewerId).toBe(owner);
    expect(() => decodeMyCursor({ limit: 3, after: encoded }, owner, now)).toThrow();
    expect(() => decodeMyCursor({ ...query, after: encoded }, randomUUID(), now)).toThrow();
    for (const changed of [
      { ...base, scope: "discovery" },
      { ...base, asOf: "2027-01-01T00:00:00Z" },
      { ...base, seed: "client-seed" },
      { ...base, extra: true },
      { ...base, last: { ...base.last, createdAt: "2027-01-01T00:00:00Z" } },
    ])
      expect(() =>
        decodeMyCursor(
          { ...query, after: Buffer.from(JSON.stringify(changed)).toString("base64url") },
          owner,
          now,
        ),
      ).toThrow();
    // Các độ chính xác ISO hợp lệ khác nhau vẫn mô tả cùng mốc thời gian biên.
    const seconds = { ...base, last: { ...base.last, createdAt: "2026-11-13T10:00:00Z" } };
    expect(
      decodeMyCursor(
        { ...query, after: Buffer.from(JSON.stringify(seconds)).toString("base64url") },
        owner,
        now,
      ).last.createdAt,
    ).toBe(seconds.last.createdAt);
  });
});
