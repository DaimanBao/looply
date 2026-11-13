import { createHash, createHmac, randomBytes } from "node:crypto";

/** Sinh bearer secret opaque có entropy cao; chỉ lưu digest. */
export function secret(): string {
  return randomBytes(32).toString("base64url");
}
/** Băm token entropy cao để tra cứu mà không lưu giá trị bearer. */
export function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
/** Bảo vệ OTP entropy thấp bằng pepper phía server không có trong bản dump Redis. */
export function otpDigest(pepper: string, binding: string, code: string): string {
  return createHmac("sha256", pepper).update(binding).update(":").update(code).digest("hex");
}
