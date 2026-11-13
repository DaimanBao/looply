import type { RequestHandler } from "express";
import type { EphemeralAuth } from "../redis/ephemeral-auth";

/** Applies a shared Redis limit before expensive authentication work, failing closed on store outages. */
export function authenticationLimit(ephemeral: EphemeralAuth): RequestHandler {
  return async (request, _response, next) => {
    try { await ephemeral.limit(`ip:${request.ip ?? "unknown"}`, ephemeral.limits.ip.maximum, ephemeral.limits.ip.seconds); next(); } catch (error) { next(error); }
  };
}
