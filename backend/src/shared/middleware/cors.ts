import cors from "cors";
import type { HttpConfig } from "../../config/environment";
import { AppError } from "../errors/app-error";

/** Cho phép chính xác origin trình duyệt đã cấu hình cùng yêu cầu cùng origin/không từ trình duyệt. */
export function createCors(config: HttpConfig) {
  return cors({
    origin: (origin, callback) => {
      if (!origin || config.corsOrigins.includes(origin)) callback(null, true);
      else callback(new AppError(403, "CORS_ORIGIN_DENIED", "The request origin is not allowed."));
    },
    credentials: config.corsCredentials,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Request-ID"],
    exposedHeaders: ["X-Request-ID", "RateLimit", "Retry-After"],
    optionsSuccessStatus: 204,
  });
}
