import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import { createLogger } from "./shared/logger/logger";

describe("GET /api/health", () => {
  it("should return HTTP 200 and healthy service status", async () => {
    const app = createApp({
      config: { corsOrigins: [], corsCredentials: false, jsonBodyLimitBytes: 1024, rateLimitWindowMs: 60000, rateLimitMax: 100 },
      logger: createLogger("silent"),
    });
    const response = await request(app).get("/api/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: "ok",
      service: "looply-backend",
    });
  });
});
