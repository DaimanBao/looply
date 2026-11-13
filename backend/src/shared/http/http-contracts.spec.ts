import { describe, expect, it } from "vitest";
import { Prisma } from "../../generated/prisma/client";
import { serializeDecimal } from "./decimal";
import { createPaginationSchema, cursorPage } from "./pagination";

describe("Explicit HTTP serialization", () => {
  // Đầu ra Decimal chính xác, không qua chuyển đổi số thực JavaScript.
  it.each(["1", "999999999999999", "123456789.123456789"])(
    "serializes %s as an exact string",
    (value) => {
      expect(serializeDecimal(new Prisma.Decimal(value))).toBe(value);
    },
  );

  // Tiền tùy chọn tiếp tục vắng mặt, không thành chuỗi 'null'.
  it("preserves null", () => {
    expect(serializeDecimal(null)).toBeNull();
  });

  // Chặn giá trị không hữu hạn dù bên gọi không an toàn trong tương lai bỏ qua validation database.
  it.each(["NaN", "Infinity", "-Infinity"])("rejects %s", (value) => {
    expect(() => serializeDecimal(new Prisma.Decimal(value))).toThrow("non-finite decimal");
  });

  // Phân tích query có mặc định và giới hạn do feature chọn tường minh.
  it("validates cursor queries and constructs a terminal page", () => {
    const schema = createPaginationSchema({ defaultLimit: 12, maxLimit: 30 });
    expect(schema.parse({})).toEqual({ limit: 12 });
    expect(schema.parse({ limit: "30", after: "opaque-cursor" })).toEqual({
      limit: 30,
      after: "opaque-cursor",
    });
    expect(cursorPage([{ id: "public-id" }], null)).toEqual({
      data: [{ id: "public-id" }],
      pagination: { nextCursor: null },
    });
  });

  // Từ chối cursor sai trước khi đến repository.
  it.each([{ limit: "0" }, { limit: "31" }, { limit: "1.5" }, { after: "" }, { unknown: "value" }])(
    "rejects cursor input %#",
    (query) => {
      expect(
        createPaginationSchema({ defaultLimit: 12, maxLimit: 30 }).safeParse(query).success,
      ).toBe(false);
    },
  );

  // Cấu hình developer sai phải lỗi khi lắp ghép feature, không chờ yêu cầu đầu tiên.
  it("rejects contradictory pagination bounds", () => {
    expect(() => createPaginationSchema({ defaultLimit: 30, maxLimit: 12 })).toThrow();
  });
});
