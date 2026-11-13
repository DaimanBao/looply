import { z } from "zod";

export type CursorPage<T> = { data: T[]; pagination: { nextCursor: string | null } };

/** Tạo validator query cursor có giới hạn; mỗi feature sở hữu thứ tự và ý nghĩa cursor. */
export function createPaginationSchema(options: { defaultLimit: number; maxLimit: number }) {
  if (
    !Number.isInteger(options.defaultLimit) ||
    !Number.isInteger(options.maxLimit) ||
    options.defaultLimit < 1 ||
    options.defaultLimit > options.maxLimit
  ) {
    throw new Error("Invalid pagination configuration");
  }
  return z
    .object({
      limit: z.coerce.number().int().min(1).max(options.maxLimit).default(options.defaultLimit),
      after: z.string().min(1).max(2048).optional(),
    })
    .strict();
}

/** Tạo response cursor công khai từ DTO do controller sở hữu chọn tường minh. */
export function cursorPage<T>(data: T[], nextCursor: string | null): CursorPage<T> {
  return { data, pagination: { nextCursor } };
}
