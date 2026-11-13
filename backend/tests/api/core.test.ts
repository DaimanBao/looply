import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app";
import * as databaseFactory from "../../src/shared/database/prisma";
import { createTestApp } from "../helpers/test-app";
import { createCoreTestRouter } from "../helpers/core-test-routes";
import { privateFailureText } from "../helpers/core-test-handlers";
import { captureLogs } from "../helpers/log-capture";

/** Tạo router feature chỉ cho test trên app không nạp cấu hình database. */
function fixtureApp() {
  return createTestApp({ featureRouters: [createCoreTestRouter()] });
}

describe("Backend Core HTTP integration", () => {
  // Endpoint hiện có giữ tương thích và thêm header bảo mật/tương quan.
  it("preserves health and adds Helmet headers", async () => {
    const response = await request(createTestApp()).get("/api/health");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok", service: "looply-backend" });
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["content-security-policy"]).toBeTruthy();
    expect(response.headers["x-powered-by"]).toBeUndefined();
    expect(response.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });

  // Không phản chiếu chuỗi tùy ý do bên gọi kiểm soát thành định danh tương quan.
  it.each([randomUUID(), "untrusted-request-id"])("handles request ID case %#", async (id) => {
    const response = await request(createTestApp()).get("/api/health").set("X-Request-ID", id);
    expect(response.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
    if (id === "untrusted-request-id") expect(response.headers["x-request-id"]).not.toBe(id);
    else expect(response.headers["x-request-id"]).toBe(id);
  });

  // Route không tồn tại không phản chiếu đường dẫn hoặc query do người dùng cung cấp vào lỗi.
  it("returns safe JSON 404 with the same request ID", async () => {
    const response = await request(createTestApp()).get("/private-path?token=fixture-query-secret");
    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: {
        code: "NOT_FOUND",
        message: "The requested resource was not found.",
        requestId: response.headers["x-request-id"],
      },
    });
    expect(response.text).not.toContain("fixture-query-secret");
  });

  // Lỗi parser đến trước handler feature vẫn dùng schema lỗi công khai.
  it("handles malformed JSON without reflecting the body", async () => {
    const response = await request(fixtureApp())
      .post("/api/validation")
      .set("Content-Type", "application/json")
      .send('{"secret":"fixture-body-secret",');
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_JSON");
    expect(response.text).not.toContain("fixture-body-secret");
  });

  // Quota body từ chối trước khi parse payload quá lớn hoặc gọi route.
  it("rejects oversized JSON", async () => {
    const response = await request(createTestApp({ config: { jsonBodyLimitBytes: 32 } }))
      .post("/api/anything")
      .send({ value: "x".repeat(100) });
    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe("PAYLOAD_TOO_LARGE");
  });

  // Parser JSON từ chối encoding văn bản không hỗ trợ mà không phản chiếu đầu vào.
  it("rejects unsupported JSON charset", async () => {
    const response = await request(fixtureApp())
      .post("/api/validation")
      .set("Content-Type", "application/json; charset=iso-8859-1")
      .send('{"name":"Alice"}');
    expect(response.status).toBe(415);
    expect(response.body.error.code).toBe("UNSUPPORTED_ENCODING");
  });

  // Ranh giới validation biến đổi giá trị query/body mà không ghi đè req.query.
  it("passes parsed body/query DTOs to a controller", async () => {
    const response = await request(fixtureApp())
      .post("/api/validation?limit=2")
      .send({ name: "  Alice  " });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ body: { name: "Alice" }, query: { limit: 2 }, params: {} });
  });

  // Chi tiết validation có cấu trúc chứa vị trí/mã trường thay vì giá trị gửi lên.
  it("rejects invalid fields with safe validation details", async () => {
    const response = await request(fixtureApp())
      .post("/api/validation?limit=0")
      .send({ name: "a" });
    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({
      code: "VALIDATION_ERROR",
      details: expect.arrayContaining([
        { path: "body.name", code: "too_small" },
        { path: "query.limit", code: "too_small" },
      ]),
    });
  });

  // Exception đồng bộ/bất đồng bộ không được lộ thông báo server, stack trace hoặc secret yêu cầu trong log.
  it.each(["/internal", "/async-internal"])("protects response and logs for %s", async (path) => {
    const logs = captureLogs();
    const app = createApp({
      config: {
        corsOrigins: [],
        corsCredentials: false,
        jsonBodyLimitBytes: 1024,
        rateLimitWindowMs: 60000,
        rateLimitMax: 100,
      },
      logger: logs.logger,
      featureRouters: [createCoreTestRouter()],
    });
    const response = await request(app)
      .get(`/api${path}?token=fixture-query-secret`)
      .set("Authorization", "Bearer fixture-access-secret")
      .set("Cookie", "refresh=fixture-cookie-secret");
    expect(response.status).toBe(500);
    expect(response.body.error).toEqual({
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred.",
      requestId: response.headers["x-request-id"],
    });
    expect(logs.text()).toContain(response.headers["x-request-id"]);
    expect(logs.text()).toContain("INTERNAL_ERROR");
    for (const secret of [
      privateFailureText,
      "fixture-query-secret",
      "fixture-access-secret",
      "fixture-cookie-secret",
    ]) {
      expect(response.text).not.toContain(secret);
      expect(logs.text()).not.toContain(secret);
    }
  });

  // Có lớp lỗi xác thực/phân quyền công khai mà không triển khai hành vi Auth.
  it.each([
    ["/unauthenticated", 401, "UNAUTHENTICATED"],
    ["/forbidden", 403, "FORBIDDEN"],
    ["/prisma-conflict", 409, "CONFLICT"],
  ] as const)("maps %s safely", async (path, status, code) => {
    const response = await request(fixtureApp()).get(`/api${path}`);
    expect(response.status).toBe(status);
    expect(response.body.error.code).toBe(code);
    expect(response.text).not.toContain("private");
  });

  // Lỗi sau khi gửi header phải ngắt stream thay vì nối envelope JSON không hợp lệ.
  it("closes a failed partial response", async () => {
    await expect(request(fixtureApp()).get("/api/partial-failure")).rejects.toThrow();
  });

  // Khớp origin chính xác; origin được phép chỉ bật credential qua cấu hình.
  it("allows configured CORS origins and exposes request IDs", async () => {
    const response = await request(
      createTestApp({ config: { corsOrigins: ["https://client.example"], corsCredentials: true } }),
    )
      .get("/api/health")
      .set("Origin", "https://client.example");
    expect(response.status).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe("https://client.example");
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
    expect(response.headers["access-control-expose-headers"]).toContain("X-Request-ID");
    expect(response.headers.vary).toContain("Origin");
  });

  // Mặc định từ chối truy cập trình duyệt nhưng vẫn cho yêu cầu không có Origin.
  it.each(["https://evil.example", "null"])("rejects unconfigured origin %s", async (origin) => {
    const response = await request(createTestApp()).get("/api/health").set("Origin", origin);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("CORS_ORIGIN_DENIED");
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });

  // Xử lý preflight trước đếm quota và parse body.
  it("handles allowed preflight without consuming quota", async () => {
    const app = createTestApp({
      config: { corsOrigins: ["https://client.example"], rateLimitMax: 1 },
    });
    const preflight = await request(app)
      .options("/api/health")
      .set("Origin", "https://client.example")
      .set("Access-Control-Request-Method", "GET");
    expect(preflight.status).toBe(204);
    expect((await request(app).get("/api/health")).status).toBe(200);
  });

  // ID tương quan và header dạng proxy không được đặt lại quota yêu cầu của kết nối.
  it("returns 429/Retry-After with a safe error body", async () => {
    const app = createTestApp({ config: { rateLimitMax: 1 } });
    expect(app.get("trust proxy")).toBe(false);
    expect((await request(app).get("/api/health").set("X-Real-IP", "192.0.2.1")).status).toBe(200);
    const response = await request(app)
      .get("/api/health")
      .set("X-Real-IP", "192.0.2.2")
      .set("X-Request-ID", randomUUID());
    expect(response.status).toBe(429);
    expect(response.body.error.code).toBe("RATE_LIMITED");
    expect(Number(response.headers["retry-after"])).toBeGreaterThan(0);
    expect(response.headers["ratelimit"]).toBeTruthy();
  });

  // Quota store thuộc một app instance, không ảnh hưởng test cô lập khác.
  it("isolates quota stores across app factories", async () => {
    const first = createTestApp({ config: { rateLimitMax: 1 } });
    await request(first).get("/api/health");
    expect((await request(first).get("/api/health")).status).toBe(429);
    expect(
      (await request(createTestApp({ config: { rateLimitMax: 1 } })).get("/api/health")).status,
    ).toBe(200);
  });

  // Dù có DATABASE_URL development, lắp ghép app không được tạo database client.
  it("never constructs Prisma for HTTP-only integration tests", async () => {
    const spy = vi.spyOn(databaseFactory, "createPrismaClient");
    try {
      expect((await request(fixtureApp()).get("/api/health")).status).toBe(200);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  // Tài liệu production chỉ chứa endpoint thật và response liveness được giữ nguyên.
  it("documents only the implemented health contract", () => {
    const contract: unknown = JSON.parse(
      readFileSync(resolve(__dirname, "../../../docs/api/openapi.json"), "utf8"),
    );
    expect(contract).toMatchObject({
      openapi: "3.1.0",
      paths: {
        "/api/health": {
          get: {
            operationId: "getHealth",
            responses: {
              "200": {
                content: {
                  "application/json": {
                    schema: {
                      properties: { status: { const: "ok" }, service: { const: "looply-backend" } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
  });
});
