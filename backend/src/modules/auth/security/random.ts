import { createHash, createHmac, randomBytes } from "node:crypto";

/** Generates an opaque, high-entropy bearer secret; only its digest should be persisted. */
export function secret(): string { return randomBytes(32).toString("base64url"); }
/** Digests high-entropy tokens for lookup without storing the bearer value. */
export function digest(value: string): string { return createHash("sha256").update(value).digest("hex"); }
/** Protects low-entropy OTPs with a server-side pepper unavailable to Redis dumps. */
export function otpDigest(pepper: string, binding: string, code: string): string {
  return createHmac("sha256", pepper).update(binding).update(":").update(code).digest("hex");
}
