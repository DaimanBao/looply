import { describe, expect, it } from "vitest";
import { loadConfig } from "./environment";
import { validateDatabaseUrl } from "./database-url";

const development = "postgresql://fixture@localhost/looply_dev";
const testing = "postgresql://fixture@localhost/looply_test";

describe("Environment configuration", () => {
  // Giá trị mặc định giữ hành vi khởi động và tắt rõ ràng thông tin xác thực trình duyệt.
  it("normalizes defaults and explicit web origins", () => {
    const config = loadConfig({
      DATABASE_URL: development,
      CORS_ORIGINS: " https://example.com/,https://example.com ",
      PORT: "3100",
    });
    expect(config).toMatchObject({
      environment: "development",
      port: 3100,
      databaseUrl: development,
      http: { corsOrigins: ["https://example.com"], corsCredentials: false },
    });
  });

  // Chế độ test không được dùng dự phòng URL development từ .env.
  it("selects only TEST_DATABASE_URL in test mode", () => {
    expect(
      loadConfig({ NODE_ENV: "test", DATABASE_URL: development, TEST_DATABASE_URL: testing })
        .databaseUrl,
    ).toBe(testing);
    expect(() => loadConfig({ NODE_ENV: "test", DATABASE_URL: development })).toThrow(
      "Missing database configuration",
    );
    expect(() => loadConfig({ NODE_ENV: "test", TEST_DATABASE_URL: development })).toThrow(
      "Invalid database configuration",
    );
  });

  // Mỗi trường từ chối giá trị sai thay vì âm thầm ép sang mặc định không an toàn.
  it.each([
    ["PORT", "0"],
    ["PORT", "65536"],
    ["PORT", "abc"],
    ["NODE_ENV", "staging"],
    ["RATE_LIMIT_MAX", "0"],
    ["RATE_LIMIT_WINDOW_MS", "-1"],
    ["JSON_BODY_LIMIT_BYTES", "0"],
    ["SHUTDOWN_TIMEOUT_MS", "0"],
    ["DATABASE_CONNECT_TIMEOUT_MS", "0"],
    ["CORS_CREDENTIALS", "yes"],
    ["CORS_ORIGINS", "*"],
    ["CORS_ORIGINS", "https://example.com/path"],
    ["CORS_ORIGINS", "https://user:private@example.com"],
    ["CORS_ORIGINS", "ftp://example.com"],
    ["LOG_LEVEL", "verbose"],
  ])("rejects invalid %s case", (key, value) => {
    expect(() => loadConfig({ DATABASE_URL: development, [key]: value })).toThrow(
      `Invalid environment configuration: ${key}`,
    );
  });

  // Thông báo chẩn đoán không được phản chiếu secret hoặc chuỗi kết nối bị từ chối.
  it("does not include rejected values in validation errors", () => {
    const secret = "do-not-log-this-secret";
    try {
      loadConfig({ DATABASE_URL: development, PORT: secret });
      throw new Error("Expected configuration failure");
    } catch (error: unknown) {
      expect(error).toMatchObject({ message: "Invalid environment configuration: PORT" });
      expect(String(error)).not.toContain(secret);
    }
  });

  // Cấu hình production có ranh giới database riêng, độc lập với dev/test.
  it("accepts the production target only in production mode", () => {
    const production = "postgresql://fixture@localhost/looply_prod";
    expect(loadConfig({ NODE_ENV: "production", DATABASE_URL: production }).databaseUrl).toBe(
      production,
    );
    expect(() => loadConfig({ DATABASE_URL: production })).toThrow();
  });

  // Lỗi URL database dùng thông báo cố định cả khi đầu vào sai định dạng hoặc ghi đè kết nối.
  it.each([
    undefined,
    "invalid",
    "https://localhost/looply_test",
    development,
    `${testing}?dbname=looply_dev`,
    `${testing}?database=looply_dev`,
    `${testing}?schema=other`,
  ])("rejects unsafe test database URL case %#", (value) => {
    expect(() => validateDatabaseUrl(value, "test")).toThrow();
  });
});
