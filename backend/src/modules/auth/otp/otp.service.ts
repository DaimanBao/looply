import type { z } from "zod";
import { emailSchema, phoneSchema, type requestOtpSchema } from "../auth.schema";
import type { AuthRepository } from "../auth.repository";
import type { EphemeralAuth } from "../redis/ephemeral-auth";
import type { MessageProvider, OtpBinding, OtpPurpose, Principal } from "../auth.types";
import { forbidden } from "../auth.errors";
import { AppError } from "../../../shared/errors/app-error";

/** Normalizes contacts using the same canonical value for Redis binding and database ownership. */
export function normalizeContact(value: string, field?: "email" | "phone"): string {
  const email = field ? field === "email" : value.includes("@");
  const result = (email ? emailSchema : phoneSchema).safeParse(value);
  if (!result.success) throw new AppError(400, "INVALID_CONTACT", "Enter a valid email address or E.164 phone number.");
  return result.data;
}
/** Produces stable server-owned bindings; callers never accept identity fields from HTTP bodies. */
export function otpBinding(purpose: OtpPurpose, destination: string, actor?: { userId: string; sessionId?: string }): OtpBinding {
  return { purpose, destination, ...(actor ? { userId: actor.userId, ...(actor.sessionId ? { sessionId: actor.sessionId } : {}) } : {}) };
}
export class OtpService {
  /** Separates delivery adapters from Redis state and account eligibility. */
  constructor(private readonly repository: AuthRepository, readonly ephemeral: EphemeralAuth, private readonly sms: MessageProvider, private readonly email: MessageProvider) {}
  /** Gives unknown login/recovery contacts the same accepted shape without sending a usable recovery code. */
  async request(input: z.infer<typeof requestOtpSchema>, principal?: Principal): Promise<{ challengeId: string; expiresIn: number }> {
    const phonePurpose = ["REGISTER_PHONE", "LOGIN_PHONE", "CHANGE_PHONE", "REAUTH_PHONE"].includes(input.purpose);
    const destination = normalizeContact(input.destination, phonePurpose ? "phone" : input.purpose === "VERIFY_EMAIL" ? "email" : undefined);
    const protectedPurpose = ["VERIFY_EMAIL", "CHANGE_PHONE", "REAUTH_PHONE"].includes(input.purpose);
    if (protectedPurpose && (!principal || principal.status !== "ACTIVE")) throw forbidden();
    let deliver = true;
    let recipient: { userId: string } | undefined;
    if (["LOGIN_PHONE", "RESET_PASSWORD"].includes(input.purpose)) {
      const user = await this.repository.contact(destination);
      deliver = !!user && ["ACTIVE", "PENDING_DELETION"].includes(user.status);
      if (deliver && user) recipient = { userId: user.id };
    }
    if (input.purpose === "REAUTH_PHONE") {
      const user = principal && await this.repository.user({ id: principal.userId });
      if (!user || !user.phoneVerifiedAt || user.phone !== destination) throw forbidden();
    }
    const binding = otpBinding(input.purpose, destination, protectedPurpose ? principal : recipient);
    const challenge = await this.ephemeral.requestOtp(binding);
    if (deliver) await (destination.includes("@") ? this.email : this.sms).send(destination, challenge.code);
    return { challengeId: challenge.challengeId, expiresIn: 300 };
  }
}
