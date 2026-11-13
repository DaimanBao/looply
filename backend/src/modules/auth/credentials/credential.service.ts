import type { z } from "zod";
import type { changePasswordSchema, changeContactSchema, reauthSchema, resetSchema } from "../auth.schema";
import type { AuthRepository } from "../auth.repository";
import type { SessionService } from "../sessions/session.service";
import type { IdentityService } from "../identity/identity.service";
import type { EphemeralAuth } from "../redis/ephemeral-auth";
import type { PasswordScreen, Principal } from "../auth.types";
import { unauthorized } from "../auth.errors";
import { hashPassword, verifyPassword } from "../security/password";
import { normalizeContact, otpBinding } from "../otp/otp.service";
import type { DatabaseTransaction } from "../../../shared/database/prisma";

export class CredentialService {
  /** Centralizes credential mutation and proof verification rather than duplicating it in User controllers. */
  constructor(private readonly repository: AuthRepository, private readonly sessions: SessionService, private readonly identity: IdentityService, private readonly ephemeral: EphemeralAuth, private readonly passwords: PasswordScreen) {}
  /** Public cleanup boundary; active accounts can never call this privileged operation. */
  async eraseForDeletion(userId: string, tx: DatabaseTransaction): Promise<void> {
    const user = await this.repository.user({ id: userId }, tx);
    if (!user || !["DELETING", "DELETED"].includes(user.status)) throw unauthorized();
    await this.repository.erase(userId, tx);
  }
  /** Accepts exactly one re-auth method and ties the resulting one-use proof to the current operation/session. */
  async reauthenticate(principal: Principal, input: z.infer<typeof reauthSchema>) {
    await this.ephemeral.limit(`reauth:${principal.sessionId}`, this.ephemeral.limits.reauth.maximum, this.ephemeral.limits.reauth.seconds);
    const methods = Number(input.password !== undefined) + Number(!!input.code) + Number(!!input.credential);
    if (methods !== 1) throw unauthorized();
    await this.repository.transaction(async (tx) => {
      await this.repository.lock(tx, principal.userId);
      const user = await this.sessions.requireCurrent(principal, tx);
      if (input.password !== undefined) {
        if (!await verifyPassword(user.passwordHash, input.password)) throw unauthorized();
      } else if (input.code && input.challengeId) {
        if (!user.phone || !user.phoneVerifiedAt) throw unauthorized();
        await this.ephemeral.consumeOtp(otpBinding("REAUTH_PHONE", user.phone, principal), input.challengeId, input.code);
      } else if (input.credential && input.challengeId) {
        const identity = await this.identity.verifyGoogle({ credential: input.credential, challengeId: input.challengeId }, principal);
        const linked = await this.repository.googleForUser(user.id, tx);
        if (!linked || linked.googleSubject !== identity.subject) throw unauthorized();
      } else throw unauthorized();
    });
    return { reauthProof: await this.ephemeral.issueProof(this.ephemeral.reauthBinding(principal.sessionId, input.operation)), expiresIn: 300 };
  }
  /** Changes credentials and revokes other sessions under the same User lock used by login/refresh. */
  async changePassword(principal: Principal, input: z.infer<typeof changePasswordSchema>): Promise<void> {
    await this.passwords.check(input.password); const hash = await hashPassword(input.password);
    await this.identity.consumeReauth(principal, "CHANGE_PASSWORD", input.reauthProof);
    await this.repository.transaction(async (tx) => {
      await this.repository.lock(tx, principal.userId);
      await this.sessions.requireCurrent(principal, tx);
      await this.repository.password(principal.userId, hash, tx);
      await this.repository.revoke(principal.userId, tx, principal.sessionId);
    });
  }
  /** Uses only an owned verified recovery contact and invalidates all sessions, including the current one. */
  async resetPassword(input: z.infer<typeof resetSchema>): Promise<void> {
    const destination = normalizeContact(input.destination);
    await this.passwords.check(input.password); const hash = await hashPassword(input.password);
    const candidate = await this.repository.contact(destination);
    if (!candidate) throw unauthorized();
    await this.repository.transaction(async (tx) => {
      await this.repository.lock(tx, candidate.id, [`contact:${destination}`]);
      const current = await this.repository.contact(destination, tx);
      if (!current || current.id !== candidate.id || !["ACTIVE", "PENDING_DELETION"].includes(current.status)) throw unauthorized();
      await this.ephemeral.consumeOtp(otpBinding("RESET_PASSWORD", destination, { userId: current.id }), input.challengeId, input.code);
      await this.repository.password(current.id, hash, tx); await this.repository.revoke(current.id, tx);
    });
  }
  /** Verifies the new contact and re-auth proof; email declaration invalidation is atomic with ownership. */
  async changeContact(principal: Principal, field: "email" | "phone", input: z.infer<typeof changeContactSchema>): Promise<void> {
    const destination = normalizeContact(input.destination, field);
    await this.identity.consumeReauth(principal, field === "email" ? "CHANGE_EMAIL" : "CHANGE_PHONE", input.reauthProof);
    await this.ephemeral.consumeOtp(otpBinding(field === "email" ? "VERIFY_EMAIL" : "CHANGE_PHONE", destination, principal), input.challengeId, input.code);
    await this.repository.transaction(async (tx) => {
      await this.repository.lockContact(tx, principal.userId, destination);
      await this.sessions.requireCurrent(principal, tx);
      await this.repository.verifiedContact(principal.userId, destination, tx);
    });
  }
}
