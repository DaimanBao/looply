import type { Response } from "express";
import { z } from "zod";

/** Thu hẹp đầu vào unknown đã kiểm tra của Core sang DTO controller mà không ép kiểu TypeScript thiếu an toàn. */
export function body<T>(response: Response, schema: z.ZodType<T>): T {
  return z.object({ body: schema }).parse(response.locals.validated).body;
}
