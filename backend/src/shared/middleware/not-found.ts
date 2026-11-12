import type { RequestHandler } from "express";
import { AppError } from "../errors/app-error";

/** Produces a safe 404 without reflecting the URL or query string into the response. */
export const notFound: RequestHandler = (_request, _response, next) => {
  next(new AppError(404, "NOT_FOUND", "The requested resource was not found."));
};
