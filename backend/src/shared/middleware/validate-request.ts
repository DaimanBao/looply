import type { Request, RequestHandler, Response } from "express";
import type { ParamsDictionary, Query } from "express-serve-static-core";
import { z } from "zod";
import { AppError } from "../errors/app-error";

/** Kiểm tra phần HTTP được schema khai báo và giữ nguyên định dạng lỗi của Core. */
export function parseRequest<T>(schema: z.ZodType<T>, request: Request): T {
  const result = schema.safeParse({
    body: request.body,
    query: request.query,
    params: request.params,
  });
  if (!result.success)
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "The request contains invalid values.",
      result.error.issues.map((issue) => ({ path: issue.path.join("."), code: issue.code })),
    );
  return result.data;
}

/** Gắn schema với controller để giá trị đã kiểm tra đi thẳng vào handler có kiểu. */
export function validatedHandler<T>(
  schema: z.ZodType<T>,
  handle: (input: T, response: Response, request: Request) => Promise<void> | void,
): RequestHandler {
  return async (request, response) => {
    await handle(parseRequest(schema, request), response, request);
  };
}

/** Lưu đầu vào HTTP đã kiểm tra/chuyển đổi mà không sửa query getter của Express 5. */
export function validateRequest<T>(
  schema: z.ZodType<T>,
): RequestHandler<ParamsDictionary, unknown, unknown, Query, { validated?: unknown }> {
  return (request, response, next) => {
    response.locals.validated = parseRequest(schema, request);
    next();
  };
}
