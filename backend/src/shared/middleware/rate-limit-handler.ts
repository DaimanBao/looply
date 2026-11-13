import type { RequestHandler } from "express";
import { AppError } from "../errors/app-error";

/** Chuyển lỗi quota sang ranh giới lỗi chung, giữ header Retry-After. */
export const rateLimitHandler: RequestHandler = (_request, _response, next) => {
  next(new AppError(429, "RATE_LIMITED", "Too many requests; try again later."));
};
