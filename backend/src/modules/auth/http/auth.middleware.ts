import type { RequestHandler, Response } from "express";
import type { SessionService } from "../session.service";
import type { Principal } from "../auth.types";
import { unauthorized } from "../auth.errors";

/** Chọn phiên bearer, từ chối thông tin xác thực tùy chọn sai định dạng thay vì coi là khách. */
export function authenticate(
  sessions: SessionService,
  options: { optional?: boolean; pending?: boolean } = {},
): RequestHandler {
  return async (request, response, next) => {
    try {
      const header = request.headers.authorization;
      if (!header && options.optional) {
        next();
        return;
      }
      const match = header?.match(/^Bearer ([A-Za-z0-9._-]+)$/);
      if (!match) throw unauthorized();
      response.locals.principal = await sessions.authenticate(match[1], !options.pending);
      next();
    } catch (error) {
      next(error);
    }
  };
}
/** Yêu cầu danh tính do middleware thiết lập trước khi controller gọi service được bảo vệ. */
export function principal(response: Response): Principal {
  if (!response.locals.principal) throw unauthorized();
  return response.locals.principal;
}
