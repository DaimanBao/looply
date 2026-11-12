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

/** Returns only the parsed DTO so tests can verify validation transforms reach controllers. */
export const echoValidated: RequestHandler<ParamsDictionary, unknown, unknown, Query, { validated: FixtureInput }> = (_request, response) => {
  response.json(response.locals.validated);
};

/** Simulates an internal exception without implementing a business endpoint. */
export const failInternally: RequestHandler = () => { throw new Error(privateFailureText); };

/** Exercises Express 5's automatic forwarding of rejected async handlers. */
export const failAsynchronously: RequestHandler = async () => {
  await Promise.resolve();
  throw new Error(privateFailureText);
};

/** Simulates an authentication failure contract; performs no authentication. */
export const failUnauthenticated: RequestHandler = () => { throw new AppError(401, "UNAUTHENTICATED", "Authentication is required."); };

/** Simulates an authorization failure contract; performs no permission lookup. */
export const failForbidden: RequestHandler = () => { throw new AppError(403, "FORBIDDEN", "The operation is forbidden."); };

/** Exercises actual Prisma error classification without connecting to any database. */
export const failPrisma: RequestHandler = () => {
  throw new Prisma.PrismaClientKnownRequestError(privateFailureText, { code: "P2002", clientVersion: "7.10.1", meta: { target: "private_column" } });
};

/** Exercises cleanup when a streaming response has already sent headers. */
export const failAfterHeaders: RequestHandler = (_request, response, next) => {
  response.write("partial");
  next(new Error(privateFailureText));
};
