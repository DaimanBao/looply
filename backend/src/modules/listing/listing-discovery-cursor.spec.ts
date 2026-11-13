import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { discoveryQuerySchema } from "./listing-discovery.schema";
import { decodeDiscoveryCursor, encodeDiscoveryCursor } from "./listing-discovery-cursor";

const now = new Date("2026-11-13T00:00:00.000Z");
const id = randomUUID();
describe("Discovery cursor", () => {
  it("rejects ISO year zero in both timestamp fields before constructing SQL", () => {
    const query = discoveryQuerySchema.parse({}); const cursor = decodeDiscoveryCursor(query, "discovery", null, now);
    for (const value of [
      { ...cursor, asOf: "0000-01-01T00:00:00.000Z", last: { id, createdAt: "0000-01-01T00:00:00.000Z" } },
      { ...cursor, last: { id, createdAt: "0000-01-01T00:00:00.000Z" } },
    ]) expect(() => decodeDiscoveryCursor({ ...query, after: Buffer.from(JSON.stringify(value)).toString("base64url") }, "discovery", null, now)).toThrow();
  });
  it("validates the derived postedWithin lower bound for price and random as well as time sorts", () => {
    for (const input of [
      { postedWithin: "24H" },
      { postedWithin: "7D", type: "SALE", sort: "PRICE_ASC" },
      { postedWithin: "30D", feed: "national" },
    ]) {
      const query = discoveryQuerySchema.parse(input); const cursor = decodeDiscoveryCursor(query, "discovery", null, now);
      const last = query.sort === "RANDOM" ? { id, rank: "a".repeat(32) } : query.sort === "PRICE_ASC" ? { id, price: "100" } : { id, createdAt: "0001-01-01T00:00:00.000Z" };
      const after = Buffer.from(JSON.stringify({ ...cursor, asOf: "0001-01-01T00:00:00.000Z", last })).toString("base64url");
      expect(() => decodeDiscoveryCursor({ ...query, after }, "discovery", null, now)).toThrow();
    }
  });
  it("binds equivalent normalized query, viewer, scope and all effective filters", () => {
    const query = discoveryQuerySchema.parse({ q: "Đồ đạc", limit: "2" });
    const cursor = decodeDiscoveryCursor(query, "discovery", id, now);
    const after = encodeDiscoveryCursor(cursor, { id, createdAt: now.toISOString() });
    expect(decodeDiscoveryCursor({ ...query, after }, "discovery", id, now)).toEqual({ ...cursor, last: { id, createdAt: now.toISOString() } });
    for (const change of [{ q: "khac" }, { limit: 3 }, { sort: "OLDEST" as const }, { provinceCode: "79" }, { type: "SALE" as const }, { postedWithin: "7D" as const }]) {
      expect(() => decodeDiscoveryCursor({ ...query, ...change, after }, "discovery", id, now)).toThrow();
    }
    expect(() => decodeDiscoveryCursor({ ...query, after }, "followed", id, now)).toThrow();
    expect(() => decodeDiscoveryCursor({ ...query, after }, "discovery", null, now)).toThrow();
  });
  it("rejects malformed tokens, future asOf, wrong boundary/seed and extra fields", () => {
    const query = discoveryQuerySchema.parse({}); const cursor = decodeDiscoveryCursor(query, "discovery", null, now);
    const valid = { ...cursor, last: { id, createdAt: now.toISOString() } };
    for (const value of [{ ...valid, extra: true }, { ...valid, asOf: "2027-01-01T00:00:00.000Z" }, { ...valid, seed: "a".repeat(32) }, { ...valid, last: { id, price: "1" } }, { ...valid, last: null }, { ...valid, last: { id, createdAt: "2027-01-01T00:00:00.000Z" } }]) {
      expect(() => decodeDiscoveryCursor({ ...query, after: Buffer.from(JSON.stringify(value)).toString("base64url") }, "discovery", null, now)).toThrow();
    }
    expect(() => decodeDiscoveryCursor({ ...query, after: "bad" }, "discovery", null, now)).toThrow();
  });
  it("keeps the random seed across pages and generates fresh sessions", () => {
    const query = discoveryQuerySchema.parse({ feed: "national" }); const cursor = decodeDiscoveryCursor(query, "discovery", null, now);
    expect(cursor.seed).toMatch(/^[a-f0-9]{32}$/);
    expect(decodeDiscoveryCursor(query, "discovery", null, now).seed).not.toBe(cursor.seed);
    const after = encodeDiscoveryCursor(cursor, { id, rank: "a".repeat(32) });
    expect(decodeDiscoveryCursor({ ...query, after }, "discovery", null, now).seed).toBe(cursor.seed);
  });
});
