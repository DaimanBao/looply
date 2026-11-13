import type { RequestHandler } from "express";
import type { ParamsDictionary, Query } from "express-serve-static-core";
import { z } from "zod";
import { AppError } from "../errors/app-error";

/** Lưu đầu vào HTTP đã kiểm tra/chuyển đổi mà không sửa query getter của Express 5. */
export function validateRequest<T>(
  schema: z.ZodType<T>,
): RequestHandler<ParamsDictionary, unknown, unknown, Query, { validated?: unknown }> {
  return (request, response, next) => {
    const result = schema.safeParse({
      body: request.body,
      query: request.query,
      params: request.params,
    });
    if (!result.success) {
      next(
        new AppError(
          400,
          "VALIDATION_ERROR",
          "The request contains invalid values.",
          result.error.issues.map((issue) => ({ path: issue.path.join("."), code: issue.code })),
        ),
      );
      return;
    }
    response.locals.validated = result.data;
    next();
  };
}

/** Áp dụng schema body của feature qua cùng contract validation/lỗi như yêu cầu Core. */
export function validateBody<T>(schema: z.ZodType<T>): RequestHandler {
  return validateRequest(z.object({ body: schema, params: z.unknown(), query: z.unknown() }));
}
