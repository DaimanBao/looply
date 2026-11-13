import { z } from "zod";
import { unauthorized } from "../auth.errors";

const claims = z.object({ sub: z.uuid(), sid: z.uuid() });
export class AccessTokens {
  private readonly key: Uint8Array;

  /** Giữ dữ liệu ký ngoài HTTP DTO và không ngầm đọc môi trường. */
  constructor(
    key: string,
    private readonly issuer: string,
  ) {
    this.key = new TextEncoder().encode(key);
  }

  /** Ký JWT phạm vi hẹp, hạn 15 phút, gắn với phiên đã lưu. */
  async issue(userId: string, sessionId: string): Promise<string> {
    const { SignJWT } = await import("jose");
    return new SignJWT({ sid: sessionId })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(userId)
      .setIssuer(this.issuer)
      .setAudience("looply-api")
      .setIssuedAt()
      .setExpirationTime("15m")
      .sign(this.key);
  }

  /** Kiểm tra chữ ký, thuật toán cố định, issuer, audience và hạn dùng trước khi tin claim. */
  async verify(token: string): Promise<{ userId: string; sessionId: string }> {
    try {
      const { jwtVerify } = await import("jose");
      const { payload } = await jwtVerify(token, this.key, {
        issuer: this.issuer,
        audience: "looply-api",
        algorithms: ["HS256"],
        typ: "JWT",
        maxTokenAge: "15m",
      });
      const parsed = claims.parse(payload);
      return { userId: parsed.sub, sessionId: parsed.sid };
    } catch {
      throw unauthorized();
    }
  }
}
