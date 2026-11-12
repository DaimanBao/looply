import type { RequestHandler } from "express";
import type { ParamsDictionary, Query } from "express-serve-static-core";
import type { z } from "zod";
import { AppError } from "../errors/app-error";

/** Stores validated/transformed HTTP input without mutating Express 5's query getter. */
export function validateRequest<T>(schema: z.ZodType<T>): RequestHandler<ParamsDictionary, unknown, unknown, Query, { validated: T }> {
  return (request, response, next) => {
    const result = schema.safeParse({ body: request.body, query: request.query, params: request.params });
    if (!result.success) {
      next(new AppError(400, "VALIDATION_ERROR", "The request contains invalid values.",
        result.error.issues.map((issue) => ({ path: issue.path.join("."), code: issue.code })),
      ));
      return;
    }
    response.locals.validated = result.data;
    next();
  };
}
