import type { RequestHandler } from "express";
import { AppError } from "../errors/app-error";

/** Delegates quota failures to the common error boundary, preserving Retry-After headers. */
export const rateLimitHandler: RequestHandler = (_request, _response, next) => {
  next(new AppError(429, "RATE_LIMITED", "Too many requests; try again later."));
};
