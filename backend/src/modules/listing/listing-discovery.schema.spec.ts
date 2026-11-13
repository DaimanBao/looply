import { describe, expect, it } from "vitest";
import { discoveryQuerySchema, suggestionsSchema } from "./listing-discovery.schema";

describe("Discovery query contract", () => {
  it("rejects NUL in search/suggestions and province while preserving ordinary Unicode whitespace", () => {
    expect(discoveryQuerySchema.safeParse({ q: "bàn\u0000ghế" }).success).toBe(false);
    expect(suggestionsSchema.safeParse({ q: "bàn\u0000ghế" }).success).toBe(false);
    expect(discoveryQuerySchema.safeParse({ provinceCode: "79\u0000" }).success).toBe(false);
    expect(discoveryQuerySchema.parse({ q: "  Đồ\t\nđạc  " }).q).toBe("do dac");
  });
  it("normalizes Vietnamese consistently without changing punctuation", () => {
    expect(discoveryQuerySchema.parse({ q: "  ĐỒ   ĐẠC %_\\ " }).q).toBe("do dac %_\\");
    expect(suggestionsSchema.parse({ q: "Đập" }).q).toBe("dap");
    expect(discoveryQuerySchema.parse({}).limit).toBe(12);
  });
  it.each([
    { minPrice: "1" }, { type: "EXCHANGE", sort: "PRICE_ASC" },
    { type: "RENT", minPrice: "1" }, { type: "SALE", rentalUnit: "DAY" },
    { type: "SALE", minPrice: "999999999999999", maxPrice: "999999999999998" },
    { minPrice: "1e3" }, { maxPrice: "0" }, { limit: "49" }, { limit: ["12"] },
    { feed: "nearby" }, { feed: "national", provinceCode: "79" },
    { feed: "national", q: "xe" }, { sort: "RANDOM" }, { seed: "abc" },
    { q: "😀".repeat(151) }, { q: ["a", "b"] }, { type: "SALE,RENT" },
  ])("rejects invalid query %j", (query) => { expect(discoveryQuerySchema.safeParse(query).success).toBe(false); });
  it("supports explicit deterministic national search and exact comparable price bounds", () => {
    expect(discoveryQuerySchema.parse({ feed: "national", q: "xe", sort: "NEWEST" }).sort).toBe("NEWEST");
    expect(discoveryQuerySchema.parse({ type: "RENT", rentalUnit: "MONTH", minPrice: "999999999999999", sort: "PRICE_DESC" }).minPrice).toBe("999999999999999");
  });
});
