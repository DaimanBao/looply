import { describe, expect, it } from "vitest";
import { createPrismaClient } from "./prisma";

describe("Explicit Prisma dependency", () => {
  // Kiểm tra cô lập môi trường trước khi tạo adapter.
  it.each(["looply_dev", "looply_prod"])("rejects %s in test mode", (database) => {
    expect(() =>
      createPrismaClient({
        environment: "test",
        databaseUrl: `postgresql://fixture@localhost:1/${database}`,
        databaseConnectTimeoutMs: 1000,
      }),
    ).toThrow();
  });

  // Cổng không thể truy cập chứng minh khởi tạo là lazy; ở đây không yêu cầu truy vấn hoặc kết nối.
  it("exposes native transactions without connecting during composition", async () => {
    const client = createPrismaClient({
      environment: "test",
      databaseUrl: "postgresql://fixture@localhost:1/looply_test",
      databaseConnectTimeoutMs: 1000,
    });
    expect(typeof client.$transaction).toBe("function");
    await client.$disconnect();
  });
});
