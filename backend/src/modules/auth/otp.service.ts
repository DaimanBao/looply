import type { z } from "zod";
import { emailSchema, phoneSchema, type requestOtpSchema } from "./auth.schema";
import type { AuthRepository } from "./auth.repository";
import type { EphemeralAuth } from "./redis/ephemeral-auth";
import type { MessageProvider, OtpBinding, OtpPurpose, Principal } from "./auth.types";
import { forbidden } from "./auth.errors";
import { AppError } from "../../shared/errors/app-error";

/** Chuẩn hóa liên hệ bằng cùng giá trị chuẩn cho ràng buộc Redis và quyền sở hữu database. */
export function normalizeContact(value: string, field?: "email" | "phone"): string {
  const email = field ? field === "email" : value.includes("@");
  const result = (email ? emailSchema : phoneSchema).safeParse(value);
  if (!result.success)
    throw new AppError(
      400,
      "INVALID_CONTACT",
      "Enter a valid email address or E.164 phone number.",
    );
  return result.data;
}
/** Tạo ràng buộc ổn định do server quản lý; bên gọi không nhận trường định danh từ HTTP body. */
export function otpBinding(
  purpose: OtpPurpose,
  destination: string,
  actor?: { userId: string; sessionId?: string },
): OtpBinding {
  return {
    purpose,
    destination,
    ...(actor
      ? { userId: actor.userId, ...(actor.sessionId ? { sessionId: actor.sessionId } : {}) }
      : {}),
  };
}
export class OtpService {
  /** Tách adapter gửi mã khỏi trạng thái Redis và điều kiện tài khoản. */
  constructor(
    private readonly repository: AuthRepository,
    private readonly ephemeral: EphemeralAuth,
    private readonly sms: MessageProvider,
    private readonly email: MessageProvider,
  ) {}

  /** Liên hệ đăng nhập/khôi phục không tồn tại nhận cùng dạng phản hồi chấp nhận nhưng không được gửi mã khôi phục dùng được. */
  async request(
    input: z.infer<typeof requestOtpSchema>,
    principal?: Principal,
  ): Promise<{ challengeId: string; expiresIn: number }> {
    const phonePurpose = ["REGISTER_PHONE", "LOGIN_PHONE", "CHANGE_PHONE", "REAUTH_PHONE"].includes(
      input.purpose,
    );
    const destination = normalizeContact(
      input.destination,
      phonePurpose ? "phone" : input.purpose === "VERIFY_EMAIL" ? "email" : undefined,
    );
    const protectedPurpose = ["VERIFY_EMAIL", "CHANGE_PHONE", "REAUTH_PHONE"].includes(
      input.purpose,
    );
    if (protectedPurpose && (!principal || principal.status !== "ACTIVE")) throw forbidden();
    let deliver = true;
    let recipient: { userId: string } | undefined;
    if (["LOGIN_PHONE", "RESET_PASSWORD"].includes(input.purpose)) {
      const user = await this.repository.contact(destination);
      deliver = !!user && ["ACTIVE", "PENDING_DELETION"].includes(user.status);
      if (deliver && user) recipient = { userId: user.id };
    }
    if (input.purpose === "REAUTH_PHONE") {
      const user = principal && (await this.repository.user({ id: principal.userId }));
      if (!user || !user.phoneVerifiedAt || user.phone !== destination) throw forbidden();
    }
    const binding = otpBinding(
      input.purpose,
      destination,
      protectedPurpose ? principal : recipient,
    );
    const challenge = await this.ephemeral.requestOtp(binding);
    if (deliver)
      await (destination.includes("@") ? this.email : this.sms).send(destination, challenge.code);
    return { challengeId: challenge.challengeId, expiresIn: 300 };
  }
}
