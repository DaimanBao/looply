import type { Response } from "express";
import { z } from "zod";

/** Narrows Core's unknown validated input to a controller DTO without unsafe TypeScript assertions. */
export function body<T>(response: Response, schema: z.ZodType<T>): T {
  return z.object({ body: schema }).parse(response.locals.validated).body;
}
