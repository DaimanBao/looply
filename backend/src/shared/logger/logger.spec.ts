import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createLogger } from "./logger";

describe("Structured logger redaction", () => {
  // Inspect real JSON output to catch serializer/redaction interactions rather than mocking logger calls.
  it("removes known secrets and arbitrary error messages while preserving safe context", () => {
    const chunks: string[] = [];
    const stream = new Writable({
      /** Captures JSON synchronously for this logger instance only. */
      write(chunk: Buffer, _encoding, callback) { chunks.push(chunk.toString()); callback(); },
    });
    const logger = createLogger("info", stream);
    logger.error({
      requestId: "safe-request", password: "fixture-password", otp: "fixture-otp", token: "fixture-token",
      databaseUrl: "fixture-connection", config: { databaseUrl: "fixture-nested-connection", secret: "fixture-nested-secret" },
      req: { headers: { authorization: "fixture-authorization", cookie: "fixture-cookie" }, body: { secret: "fixture-body" }, query: { token: "fixture-query" } },
      res: { headers: { "set-cookie": "fixture-set-cookie" } },
      err: new Error("fixture-internal-error"),
    }, "Request failed");
    const output = chunks.join("");
    expect(output).not.toContain("fixture-");
    const record: unknown = JSON.parse(output);
    expect(record).toMatchObject({ requestId: "safe-request", msg: "Request failed", err: { code: "INTERNAL_ERROR" } });
  });
});
