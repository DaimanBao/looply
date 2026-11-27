import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decodeMyCursor, encodeMyCursor } from "./listing-cursor";
import { normalizeListingTitle } from "./listing-search";

describe("Listing canonical values and cursor", () => {
  it("preserves the wire format and accepts previously issued owner cursors", () => {
    // Payload ghi từ phiên bản trước khi hợp nhất codec, gồm cả thứ tự trường.
    const last = {
      id: "84ad4336-3804-4dc9-9297-8534dbf0852a",
      createdAt: "2026-11-13T10:00:00.000Z",
    };
    const legacy = {
      v: 1,
      scope: "my",
      queryHash: "27146f4637bc16959c66c429404d23049f1bfe898b25d2ea668cb3ab331ec21d",
      viewerId: "27330c0f-366c-4e8d-9f8e-b97909e64b65",
      asOf: "2026-11-13T10:00:00.123Z",
      seed: null,
      last,
    };
    const after = Buffer.from(JSON.stringify(legacy)).toString("base64url");
    const query = { limit: 2, status: "HIDDEN" } as const;
    const now = new Date(legacy.asOf);
    const first = decodeMyCursor(query, legacy.viewerId, now);

    expect(
      encodeMyCursor(first, {
        id: last.id,
        createdAt: new Date(last.createdAt),
      }),
    ).toBe(after);
    expect(decodeMyCursor({ ...query, after }, legacy.viewerId, now)).toEqual(legacy);
    expect(() => decodeMyCursor({ ...query, after: after + "=" }, legacy.viewerId, now)).toThrow(
      expect.objectContaining({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Invalid continuation cursor.",
        details: [{ path: "query.after", code: "custom" }],
      }),
    );
  });

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
