import { randomInt, randomUUID } from "node:crypto";
import { AppError } from "../../../shared/errors/app-error";
import { digest, otpDigest, secret } from "../security/random";
import { unauthorized } from "../auth.errors";
import type { AuthLimits, OtpBinding, SensitiveOperation } from "../auth.types";
import type { ScriptStore } from "./redis-store";
import { requestOtpScript, verifyOtpScript } from "./otp-scripts";

const getAndDelete = `local v=redis.call('GET',KEYS[1]); if v then redis.call('DEL',KEYS[1]) end; return v`;

/** Gắn cùng định danh thao tác và phiên ở cả hai phía cấp và tiêu thụ proof. */
function reauthBinding(sessionId: string, operation: SensitiveOperation): string {
  return `reauth:${sessionId}:${operation}`;
}

export class EphemeralAuth {
  /** Dùng chung một triển khai Redis cho OTP, nonce, xác thực lại và rate limit. */
  constructor(
    private readonly store: ScriptStore,
    private readonly pepper: string,
    private readonly prefix: string,
    readonly limits: AuthLimits,
  ) {}

  /** Đặt trước challenge gắn mục đích/chủ thể trước khi gửi mà không đặt lại bộ đếm lần thử. */
  async requestOtp(binding: OtpBinding): Promise<{ challengeId: string; code: string }> {
    const challengeId = randomUUID();
    const code = randomInt(0, 1000000).toString().padStart(6, "0");
    const encoded = JSON.stringify(binding);
    const identity = this.prefix + "otp-identity:" + digest(binding.destination);
    const result = await this.store.eval(
      requestOtpScript,
      [identity, this.prefix + "otp:" + challengeId],
      [
        JSON.stringify({
          binding: encoded,
          identity,
          hash: otpDigest(this.pepper, encoded + challengeId, code),
        }),
      ],
    );
    if (result !== 1) throw new AppError(429, "OTP_LIMIT", "Wait before requesting another code.");
    return { challengeId, code };
  }

  /** Tiêu thụ mã hợp lệ một lần; không tái dùng mã cho mục đích, đích hoặc phiên khác. */
  async consumeOtp(binding: OtpBinding, challengeId: string, code: string): Promise<void> {
    const encoded = JSON.stringify(binding);
    const result = await this.store.eval(
      verifyOtpScript,
      [this.prefix + "otp:" + challengeId],
      [encoded, otpDigest(this.pepper, encoded + challengeId, code)],
    );
    if (result !== 1) throw unauthorized();
  }

  /** Cấp proof opaque hoặc Google nonce dùng một lần với thời hạn đúng năm phút. */
  async issueProof(binding: string): Promise<string> {
    const value = secret();
    await this.store.eval(
      "redis.call('SET',KEYS[1],ARGV[1],'EX',300); return 1",
      [this.prefix + "proof:" + digest(value)],
      [binding],
    );
    return value;
  }

  /** Xóa trước khi trả về để các lần dùng đồng thời có tối đa một lần thành công. */
  async consumeProof(value: string, binding: string): Promise<void> {
    const result = await this.store.eval(
      getAndDelete,
      [this.prefix + "proof:" + digest(value)],
      [],
    );
    if (result !== binding) throw unauthorized();
  }

  /** Cấp proof ngắn hạn cho đúng thao tác và phiên vừa xác thực lại. */
  issueReauth(sessionId: string, operation: SensitiveOperation): Promise<string> {
    return this.issueProof(reauthBinding(sessionId, operation));
  }

  /** Tiêu thụ một lần qua chung cổng Redis, kể cả khi proof sai thao tác. */
  consumeReauth(sessionId: string, operation: SensitiveOperation, proof: string): Promise<void> {
    return this.consumeProof(proof, reauthBinding(sessionId, operation));
  }

  /** Áp dụng giới hạn fixed-window chung; lượt bị chặn không âm thầm chuyển sang bộ nhớ. */
  async limit(identity: string, maximum: number, seconds: number): Promise<void> {
    const count = await this.store.eval(
      "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n",
      [this.prefix + "limit:" + digest(identity)],
      [String(seconds)],
    );
    if (typeof count !== "number" || count > maximum)
      throw new AppError(429, "AUTH_LIMIT", "Too many authentication attempts.");
  }
}
