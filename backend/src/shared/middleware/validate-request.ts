import type { RequestHandler } from "express";
import type { ParamsDictionary, Query } from "express-serve-static-core";
import { z } from "zod";
import { AppError } from "../errors/app-error";

/** Stores validated/transformed HTTP input without mutating Express 5's query getter. */
export function validateRequest<T>(schema: z.ZodType<T>): RequestHandler<ParamsDictionary, unknown, unknown, Query, { validated?: unknown }> {
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

/** Applies feature-owned body schemas through the same validation/error contract as Core requests. */
export function validateBody<T>(schema: z.ZodType<T>): RequestHandler {
  return validateRequest(z.object({ body: schema, params: z.unknown(), query: z.unknown() }));
}
