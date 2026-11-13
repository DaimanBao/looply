import type { RequestHandler } from "express";
import type { ParamsDictionary, Query } from "express-serve-static-core";
import { z } from "zod";
import { Prisma } from "../../src/generated/prisma/client";
import { AppError } from "../../src/shared/errors/app-error";

export const privateFailureText = "fixture-private-password-and-sql";
export const fixtureRequestSchema = z.object({
  body: z.object({ name: z.string().trim().min(3) }).strict(),
  query: z.object({ limit: z.coerce.number().int().min(1).max(30).default(12) }).strict(),
  params: z.object({}).strict(),
});
type FixtureInput = z.infer<typeof fixtureRequestSchema>;

/** Chỉ trả DTO đã parse để test xác nhận biến đổi validation đến được controller. */
export const echoValidated: RequestHandler<
  ParamsDictionary,
  unknown,
  unknown,
  Query,
  { validated: FixtureInput }
> = (_request, response) => {
  response.json(response.locals.validated);
};

/** Mô phỏng exception nội bộ mà không triển khai endpoint nghiệp vụ. */
export const failInternally: RequestHandler = () => {
  throw new Error(privateFailureText);
};

/** Kiểm tra Express 5 tự chuyển tiếp handler bất đồng bộ bị reject. */
export const failAsynchronously: RequestHandler = async () => {
  await Promise.resolve();
  throw new Error(privateFailureText);
};

/** Mô phỏng contract lỗi xác thực; không thực hiện xác thực. */
export const failUnauthenticated: RequestHandler = () => {
  throw new AppError(401, "UNAUTHENTICATED", "Authentication is required.");
};

/** Mô phỏng contract lỗi phân quyền; không tra quyền. */
export const failForbidden: RequestHandler = () => {
  throw new AppError(403, "FORBIDDEN", "The operation is forbidden.");
};

/** Kiểm tra phân loại lỗi Prisma thật mà không kết nối database. */
export const failPrisma: RequestHandler = () => {
  throw new Prisma.PrismaClientKnownRequestError(privateFailureText, {
    code: "P2002",
    clientVersion: "7.10.1",
    meta: { target: "private_column" },
  });
};

/** Kiểm tra cleanup khi response streaming đã gửi header. */
export const failAfterHeaders: RequestHandler = (_request, response, next) => {
  response.write("partial");
  next(new Error(privateFailureText));
};
