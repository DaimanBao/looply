import type { RequestHandler } from "express";
import { AppError } from "../errors/app-error";

/** Tạo 404 an toàn, không phản chiếu URL hoặc query string vào response. */
export const notFound: RequestHandler = (_request, _response, next) => {
  next(new AppError(404, "NOT_FOUND", "The requested resource was not found."));
};
