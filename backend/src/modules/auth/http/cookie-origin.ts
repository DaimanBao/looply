import type { RequestHandler } from "express";
import { forbidden } from "../auth.errors";

/** Yêu cầu Origin khớp chính xác danh sách cho phép khi refresh/logout chỉ dùng cookie; từ chối origin thiếu hoặc opaque. */
export function cookieOrigin(origins: string[]): RequestHandler {
  return (request, _response, next) => {
    if (!request.headers.origin || !origins.includes(request.headers.origin)) next(forbidden());
    else next();
  };
}
