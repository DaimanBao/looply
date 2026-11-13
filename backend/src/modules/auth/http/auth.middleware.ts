import type { RequestHandler, Response } from "express";
import type { SessionService } from "../sessions/session.service";
import type { Principal } from "../auth.types";
import { unauthorized } from "../auth.errors";

/** Selects a bearer session, rejecting malformed optional credentials instead of treating them as anonymous. */
export function authenticate(sessions: SessionService, options: { optional?: boolean; pending?: boolean } = {}): RequestHandler {
  return async (request, response, next) => {
    try {
      const header = request.headers.authorization;
      if (!header && options.optional) { next(); return; }
      const match = header?.match(/^Bearer ([A-Za-z0-9._-]+)$/);
      if (!match) throw unauthorized();
      response.locals.principal = await sessions.authenticate(match[1], !options.pending);
      next();
    } catch (error) { next(error); }
  };
}
/** Requires middleware-established identity before a controller can call a protected service. */
export function principal(response: Response): Principal {
  if (!response.locals.principal) throw unauthorized();
  return response.locals.principal;
}
