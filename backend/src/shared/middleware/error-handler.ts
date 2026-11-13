import type { ErrorRequestHandler } from "express";
import type { Logger } from "pino";
import { normalizeError } from "../errors/normalize-error";

/** Tạo ranh giới lỗi cuối với chẩn đoán an toàn và response công khai nhất quán. */
export function createErrorHandler(logger: Logger): ErrorRequestHandler {
  return (error: unknown, request, response, _next) => {
    if (response.headersSent) {
      // Không chuyển exception thô cho handler mặc định Express vì có thể in thông báo nhạy cảm.
      logger.error(
        { requestId: request.requestId, code: "RESPONSE_ALREADY_STARTED" },
        "Request failed after headers",
      );
      response.destroy();
      return;
    }
    const failure = normalizeError(error);
    if (failure.status >= 500) {
      logger.error(
        { requestId: request.requestId, code: failure.code, status: failure.status },
        "Request failed",
      );
    }
    response.status(failure.status).json({
      error: {
        code: failure.code,
        message: failure.message,
        requestId: request.requestId,
        ...(failure.details ? { details: failure.details } : {}),
      },
    });
  };
}
