import { rateLimit } from "express-rate-limit";
import type { HttpConfig } from "../../config/environment";
import { rateLimitHandler } from "./rate-limit-handler";

/** Dùng một quota store local theo tiến trình cho mỗi app; app không tin proxy header. */
export function createApiRateLimit(config: HttpConfig) {
  return rateLimit({
    windowMs: config.rateLimitWindowMs,
    limit: config.rateLimitMax,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: rateLimitHandler,
  });
}
