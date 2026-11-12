import { describe, expect, it } from "vitest";
import { Prisma } from "../../generated/prisma/client";
import { serializeDecimal } from "./decimal";
import { createPaginationSchema, cursorPage } from "./pagination";

describe("Explicit HTTP serialization", () => {
  // Decimal output is exact and never passes through JavaScript floating-point conversion.
  it.each(["1", "999999999999999", "123456789.123456789"]) ("serializes %s as an exact string", (value) => {
    expect(serializeDecimal(new Prisma.Decimal(value))).toBe(value);
  });

  // Optional money remains absent rather than becoming the string 'null'.
  it("preserves null", () => { expect(serializeDecimal(null)).toBeNull(); });

  // Guard non-finite values even if an unsafe future caller bypasses database validation.
  it.each(["NaN", "Infinity", "-Infinity"])("rejects %s", (value) => {
    expect(() => serializeDecimal(new Prisma.Decimal(value))).toThrow("non-finite decimal");
  });

  // Query parsing has explicit feature-selected defaults and bounds.
  it("validates cursor queries and constructs a terminal page", () => {
    const schema = createPaginationSchema({ defaultLimit: 12, maxLimit: 30 });
    expect(schema.parse({})).toEqual({ limit: 12 });
    expect(schema.parse({ limit: "30", after: "opaque-cursor" })).toEqual({ limit: 30, after: "opaque-cursor" });
    expect(cursorPage([{ id: "public-id" }], null)).toEqual({ data: [{ id: "public-id" }], pagination: { nextCursor: null } });
  });

  // Bad cursor input is rejected before it can reach a repository.
  it.each([{ limit: "0" }, { limit: "31" }, { limit: "1.5" }, { after: "" }, { unknown: "value" }])("rejects cursor input %#", (query) => {
    expect(createPaginationSchema({ defaultLimit: 12, maxLimit: 30 }).safeParse(query).success).toBe(false);
  });

  // Invalid developer configuration fails when composing the feature, not on the first request.
  it("rejects contradictory pagination bounds", () => {
    expect(() => createPaginationSchema({ defaultLimit: 30, maxLimit: 12 })).toThrow();
  });
});
