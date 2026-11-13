import type { RequestHandler } from "express";

/** Prevents browsers/proxies from caching identity-dependent responses, including errors and issued proofs. */
export const noStore: RequestHandler = (_request, response, next) => { response.setHeader("Cache-Control", "no-store"); next(); };
