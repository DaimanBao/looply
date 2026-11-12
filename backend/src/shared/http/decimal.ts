import { Prisma } from "../../generated/prisma/client";

/** Serializes an explicitly selected money field without exposing an entire database model. */
export function serializeDecimal(value: Prisma.Decimal | null): string | null {
  if (value === null) return null;
  if (!value.isFinite()) throw new Error("Cannot serialize a non-finite decimal");
  return value.toFixed();
}
