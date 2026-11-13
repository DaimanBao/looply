import type { RequestHandler } from "express";
import type { EphemeralAuth } from "../redis/ephemeral-auth";

/** Áp dụng giới hạn Redis chung trước xác thực tốn tài nguyên; từ chối an toàn khi store lỗi. */
export function authenticationLimit(ephemeral: EphemeralAuth): RequestHandler {
  return async (request, _response, next) => {
    try {
      await ephemeral.limit(
        `ip:${request.ip ?? "unknown"}`,
        ephemeral.limits.ip.maximum,
        ephemeral.limits.ip.seconds,
      );
      next();
    } catch (error) {
      next(error);
    }
  };
}
