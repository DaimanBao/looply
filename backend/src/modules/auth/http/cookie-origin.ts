import type { RequestHandler } from "express";
import { forbidden } from "../auth.errors";

/** Requires an exact allowed Origin for cookie-only refresh/logout, rejecting missing and opaque origins. */
export function cookieOrigin(origins: string[]): RequestHandler {
  return (request, _response, next) => { if (!request.headers.origin || !origins.includes(request.headers.origin)) next(forbidden()); else next(); };
}
