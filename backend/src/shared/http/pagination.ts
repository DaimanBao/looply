import { z } from "zod";

export type CursorPage<T> = { data: T[]; pagination: { nextCursor: string | null } };

/** Builds a bounded cursor query validator; ordering/cursor meaning remain owned by each feature. */
export function createPaginationSchema(options: { defaultLimit: number; maxLimit: number }) {
  if (!Number.isInteger(options.defaultLimit) || !Number.isInteger(options.maxLimit)
    || options.defaultLimit < 1 || options.defaultLimit > options.maxLimit) {
    throw new Error("Invalid pagination configuration");
  }
  return z.object({
    limit: z.coerce.number().int().min(1).max(options.maxLimit).default(options.defaultLimit),
    after: z.string().min(1).max(2048).optional(),
  }).strict();
}

/** Produces the public cursor response from DTOs explicitly selected by the owning controller. */
export function cursorPage<T>(data: T[], nextCursor: string | null): CursorPage<T> {
  return { data, pagination: { nextCursor } };
}
