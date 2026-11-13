import { Prisma } from "../../generated/prisma/client";

/** Tuần tự hóa trường tiền được chọn tường minh mà không lộ toàn bộ model database. */
export function serializeDecimal(value: Prisma.Decimal | null): string | null {
  if (value === null) return null;
  if (!value.isFinite()) throw new Error("Cannot serialize a non-finite decimal");
  return value.toFixed();
}
