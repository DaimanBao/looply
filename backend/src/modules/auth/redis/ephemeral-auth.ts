import { randomInt, randomUUID } from "node:crypto";
import { AppError } from "../../../shared/errors/app-error";
import { digest, otpDigest, secret } from "../security/random";
import { unauthorized } from "../auth.errors";
import type { AuthLimits, OtpBinding, SensitiveOperation } from "../auth.types";
import type { ScriptStore } from "./redis-store";
import { requestOtpScript, verifyOtpScript } from "./otp-scripts";

const getAndDelete = `local v=redis.call('GET',KEYS[1]); if v then redis.call('DEL',KEYS[1]) end; return v`;
export class EphemeralAuth {
  /** Keeps one Redis implementation for OTP, nonce, re-auth and shared rate limits. */
  constructor(private readonly store: ScriptStore, private readonly pepper: string, private readonly prefix: string, readonly limits: AuthLimits) {}
  /** Reserves a purpose/actor-bound challenge before delivery without resetting attempt counters. */
  async requestOtp(binding: OtpBinding): Promise<{ challengeId: string; code: string }> {
    const challengeId = randomUUID(); const code = randomInt(0, 1000000).toString().padStart(6, "0");
    const encoded = JSON.stringify(binding); const identity = this.prefix + "otp-identity:" + digest(binding.destination);
    const result = await this.store.eval(requestOtpScript, [identity, this.prefix + "otp:" + challengeId], [JSON.stringify({ binding: encoded, identity, hash: otpDigest(this.pepper, encoded + challengeId, code) })]);
    if (result !== 1) throw new AppError(429, "OTP_LIMIT", "Wait before requesting another code.");
    return { challengeId, code };
  }
  /** Consumes a valid code once; codes for another purpose, destination or session cannot be reused. */
  async consumeOtp(binding: OtpBinding, challengeId: string, code: string): Promise<void> {
    const encoded = JSON.stringify(binding);
    const result = await this.store.eval(verifyOtpScript, [this.prefix + "otp:" + challengeId], [encoded, otpDigest(this.pepper, encoded + challengeId, code)]);
    if (result !== 1) throw unauthorized();
  }
  /** Issues a one-use opaque proof or Google nonce with an exact five-minute lifetime. */
  async issueProof(binding: string): Promise<string> {
    const value = secret();
    await this.store.eval("redis.call('SET',KEYS[1],ARGV[1],'EX',300); return 1", [this.prefix + "proof:" + digest(value)], [binding]);
    return value;
  }
  /** Deletes before returning, so concurrent uses have at most one winner. */
  async consumeProof(value: string, binding: string): Promise<void> {
    const result = await this.store.eval(getAndDelete, [this.prefix + "proof:" + digest(value)], []);
    if (result !== binding) throw unauthorized();
  }
  /** Binds sensitive authorization to the operation and current session, never just to a User. */
  reauthBinding(sessionId: string, operation: SensitiveOperation): string { return `reauth:${sessionId}:${operation}`; }
  /** Applies a shared fixed-window limit; blocked attempts do not silently fall back to memory. */
  async limit(identity: string, maximum: number, seconds: number): Promise<void> {
    const count = await this.store.eval("local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n", [this.prefix + "limit:" + digest(identity)], [String(seconds)]);
    if (typeof count !== "number" || count > maximum) throw new AppError(429, "AUTH_LIMIT", "Too many authentication attempts.");
  }
}
