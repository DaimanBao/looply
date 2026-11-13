import type { Request, Response } from "express";
import { unauthorized } from "../auth.errors";
import type { IssuedSession } from "../auth.types";

/** Reads only one correctly formed opaque cookie, rejecting ambiguous duplicates and arbitrary encodings. */
export function refreshCookie(request: Request): string {
  const values = (request.headers.cookie ?? "").split(";").map((part) => part.trim()).filter((part) => part.startsWith("looply_refresh="));
  if (values.length !== 1) throw unauthorized();
  const value = values[0].slice("looply_refresh=".length);
  if (!/^[A-Za-z0-9_-]{43}$/.test(value)) throw unauthorized();
  return value;
}
/** Publishes only the short-lived access token; refresh remains an HttpOnly cookie and responses are never cached. */
export function sessionResponse(response: Response, issued: IssuedSession, secure: boolean, status = 200): void {
  response.cookie("looply_refresh", issued.refreshToken, { httpOnly: true, secure, sameSite: "strict", path: "/api/auth", maxAge: 7 * 86400000 });
  response.setHeader("Cache-Control", "no-store");
  response.status(status).json({ accessToken: issued.accessToken, expiresIn: issued.expiresIn, status: issued.status });
}
/** Uses exactly the same cookie scope during logout and deletion. */
export function clearRefresh(response: Response, secure: boolean): void {
  response.clearCookie("looply_refresh", { httpOnly: true, secure, sameSite: "strict", path: "/api/auth" });
}
