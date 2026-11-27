import { createHash } from "node:crypto";
import { AppError } from "../../shared/errors/app-error";

/** Giữ thứ tự trường JSON do từng scope quy định để tương thích với cursor đã cấp. */
export function hashCursorQuery(semantics: object): string {
  return createHash("sha256").update(JSON.stringify(semantics)).digest("hex");
}

/** Chỉ nhận Base64URL chuẩn; schema của scope kiểm tra payload chưa tin cậy. */
export function readCursorPayload(after: string): unknown {
  const bytes = Buffer.from(after, "base64url");
  if (bytes.toString("base64url") !== after) throw new Error("Invalid encoding");
  return JSON.parse(bytes.toString("utf8"));
}

/** Giữ định dạng token chung cho các trang Listing. */
export function writeCursorPayload(payload: object): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

/** Dùng cùng lỗi công khai cho sai định dạng và sai ràng buộc. */
export function invalidListingCursor(): AppError {
  return new AppError(400, "VALIDATION_ERROR", "Invalid continuation cursor.", [
    { path: "query.after", code: "custom" },
  ]);
}
