import { createHash } from "node:crypto";
import { z } from "zod";
import { AppError } from "../../shared/errors/app-error";

/** Thêm tháng lịch UTC, giữ thời gian trong ngày và clamp ngày cuối tháng. */
export function addMonthsUTC(date: Date, months: number): Date {
  const result = new Date(date);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const last = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(day, last));
  return result;
}

/** Áp dụng giới hạn tương đối và tuyệt đối, không dùng số ngày cố định cho một tháng. */
export function snapshotExpiry(createdAt: Date, lastActivityAt: Date): Date {
  return new Date(
    Math.min(addMonthsUTC(createdAt, 24).getTime(), addMonthsUTC(lastActivityAt, 12).getTime()),
  );
}

/** So sánh thứ tự cursor ghép khi timestamp trùng nhau; UUID được chuẩn hóa trước lưu. */
export function isAfter(
  a: { createdAt: Date; id: string },
  b: { createdAt: Date; id: string },
): boolean {
  return (
    a.createdAt.getTime() > b.createdAt.getTime() ||
    (a.createdAt.getTime() === b.createdAt.getTime() && a.id > b.id)
  );
}

/** Băm payload chuẩn do service tạo để requestId không thể dùng lại cho nội dung khác. */
export function payloadHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

const cursorSchema = z.strictObject({ scope: z.string(), time: z.iso.datetime(), id: z.uuid() });
/** Cursor gắn tài khoản/truy vấn nhưng không cấp quyền; luôn phân quyền lại khi tải trang. */
export function decodeChatCursor(after: string | undefined, scope: string) {
  if (!after) return undefined;
  try {
    const cursor = cursorSchema.parse(JSON.parse(Buffer.from(after, "base64url").toString("utf8")));
    if (cursor.scope !== scope) throw new Error("Wrong scope");
    return { id: cursor.id, createdAt: new Date(cursor.time) };
  } catch {
    throw new AppError(400, "INVALID_CURSOR", "Reload the conversation list.");
  }
}

/** Giữ keyset không phụ thuộc hàng biên còn tồn tại trong dữ liệu. */
export function encodeChatCursor(scope: string, row: { id: string; createdAt: Date }): string {
  return Buffer.from(
    JSON.stringify({ scope, time: row.createdAt.toISOString(), id: row.id }),
  ).toString("base64url");
}
