import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createLogger } from "./logger";

describe("Structured logger redaction", () => {
  // Kiểm tra đầu ra JSON thật để phát hiện tương tác serializer/redaction thay vì mock lời gọi logger.
  it("removes known secrets and arbitrary error messages while preserving safe context", () => {
    const chunks: string[] = [];
    const stream = new Writable({
      /** Thu JSON đồng bộ chỉ cho logger này. */
      write(chunk: Buffer, _encoding, callback) {
        chunks.push(chunk.toString());
        callback();
      },
    });
    const logger = createLogger("info", stream);
    logger.error(
      {
        requestId: "safe-request",
        password: "fixture-password",
        otp: "fixture-otp",
        token: "fixture-token",
        databaseUrl: "fixture-connection",
        config: { databaseUrl: "fixture-nested-connection", secret: "fixture-nested-secret" },
        AUTH_JWT_SECRET: "fixture-signing-key",
        AUTH_OTP_PEPPER: "fixture-otp-pepper",
        REDIS_URL: "fixture-redis-connection",
        provider: {
          S3_SECRET_ACCESS_KEY: "fixture-storage-key",
          SMS_PROVIDER_KEY: "fixture-sms-key",
        },
        req: {
          headers: { authorization: "fixture-authorization", cookie: "fixture-cookie" },
          body: { secret: "fixture-body" },
          query: { token: "fixture-query" },
        },
        res: { headers: { "set-cookie": "fixture-set-cookie" } },
        err: new Error("fixture-internal-error"),
      },
      "Request failed",
    );
    const output = chunks.join("");
    expect(output).not.toContain("fixture-");
    const record: unknown = JSON.parse(output);
    expect(record).toMatchObject({
      requestId: "safe-request",
      msg: "Request failed",
      err: { code: "INTERNAL_ERROR" },
    });
  });
});
