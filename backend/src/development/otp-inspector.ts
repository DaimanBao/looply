import { createServer, type Server } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { inspectOtp, type InspectorDependencies } from "./otp-inspector.reader";
import type { InspectorConfig } from "./otp-inspector.config";
export { inspectorConfig } from "./otp-inspector.config";

const requestSchema = z
  .object({ challengeId: z.uuid(), destination: z.string().min(1).max(254) })
  .strict();

/** Tạo listener loopback riêng có xác thực; router Auth/User công khai không import công cụ này. */
export function createOtpInspector(
  environment: string,
  config: InspectorConfig,
  dependencies: InspectorDependencies,
): Server {
  if (
    environment !== "development" ||
    process.env.NODE_ENV === "production" ||
    !config.enabled ||
    config.key.length < 48
  )
    throw new Error("OTP inspector is development-only");
  const expected = Buffer.from(`Bearer ${config.key}`);
  let attempts = 0;
  let windowStart = Date.now();
  const server = createServer(async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    const authorization = Buffer.from(request.headers.authorization || "");
    if (Date.now() - windowStart >= 60000) {
      attempts = 0;
      windowStart = Date.now();
    }
    if (++attempts > 60) {
      response.writeHead(429).end();
      return;
    }
    if (
      request.socket.remoteAddress !== "127.0.0.1" ||
      request.headers.origin ||
      request.headers["sec-fetch-site"] ||
      authorization.length !== expected.length ||
      !timingSafeEqual(authorization, expected)
    ) {
      response.writeHead(403).end();
      return;
    }
    if (
      request.method !== "POST" ||
      request.url !== "/inspect" ||
      request.headers["content-type"] !== "application/json"
    ) {
      response.writeHead(404).end();
      return;
    }
    try {
      let body = "";
      for await (const chunk of request) {
        body += String(chunk);
        if (Buffer.byteLength(body) > 1024) {
          response.writeHead(413).end();
          return;
        }
      }
      const input = requestSchema.parse(JSON.parse(body));
      const code = await inspectOtp(input, dependencies);
      if (!code) {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ code }));
    } catch {
      response.writeHead(503).end();
    }
  });
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  server.timeout = 5000;
  server.maxHeadersCount = 20;
  return server;
}
