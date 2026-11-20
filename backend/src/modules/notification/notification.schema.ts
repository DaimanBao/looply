import { z } from "zod";
import { AppError } from "../../shared/errors/app-error";

export const notificationId = z.uuid().transform((value) => value.toLowerCase());
export const notificationPage = z.strictObject({
  limit: z.coerce.number().int().min(1).max(50).default(30),
  after: z.string().min(1).max(1024).optional(),
});
export const notificationRead = z.strictObject({ expectedEventId: notificationId.nullable() });
export const notificationReadAll = z.strictObject({ through: z.iso.datetime() });
const cursorSchema = z.strictObject({ userId: z.uuid(), id: z.uuid(), time: z.iso.datetime() });

/** Cursor chỉ giữ biên ổn định; quyền sở hữu vẫn kiểm tra trong mọi query. */
export function decodeCursor(after: string | undefined, userId: string) {
  if (!after) return undefined;
  try {
    const value = cursorSchema.parse(JSON.parse(Buffer.from(after, "base64url").toString("utf8")));
    if (value.userId !== userId) throw new Error("Wrong scope");
    return { id: value.id, createdAt: new Date(value.time) };
  } catch {
    throw new AppError(400, "INVALID_CURSOR", "Reload the notification list.");
  }
}

/** Mã hóa keyset không phụ thuộc hàng biên còn tồn tại. */
export function encodeCursor(row: { id: string; createdAt: Date }, userId: string): string {
  return Buffer.from(
    JSON.stringify({ userId, id: row.id, time: row.createdAt.toISOString() }),
  ).toString("base64url");
}
