import { randomUUID } from "node:crypto";
import type { z } from "zod";
import type { registerSchema, passwordLoginSchema, phoneLoginSchema, googleSchema } from "../auth.schema";
import type { AuthRepository } from "../auth.repository";
import type { SessionService } from "../sessions/session.service";
import type { EphemeralAuth } from "../redis/ephemeral-auth";
import type { GoogleVerifier, PasswordScreen, Principal, SensitiveOperation } from "../auth.types";
import { conflict, unauthorized } from "../auth.errors";
import { hashPassword, verifyPassword } from "../security/password";
import { otpBinding } from "../otp/otp.service";
import { lockResources } from "../../../shared/database/locks";
import { AppError } from "../../../shared/errors/app-error";

export class IdentityService {
  private readonly dummyHash = hashPassword(randomUUID());
  /** Receives provider boundaries and persistent services explicitly. */
  constructor(private readonly repository: AuthRepository, private readonly sessions: SessionService, private readonly ephemeral: EphemeralAuth, private readonly google: GoogleVerifier, private readonly passwords: PasswordScreen) {}
  /** Screens/hashes before transaction, then creates verified phone and session as one database commit. */
  async register(input: z.infer<typeof registerSchema>) {
    await this.passwords.check(input.password);
    const passwordHash = await hashPassword(input.password); const userId = randomUUID();
    return this.repository.transaction(async (tx) => {
      await this.repository.lock(tx, userId, input.email ? [`email:${input.email}`] : []);
      const province = await this.repository.province(input.provinceCode, tx);
      if (!province) throw new AppError(400, "INVALID_PROVINCE", "Choose an active province.");
      await this.ephemeral.consumeOtp(otpBinding("REGISTER_PHONE", input.phone), input.challengeId, input.code);
      const owner = input.email ? await this.repository.contact(input.email, tx) : null;
      const user = await this.repository.createUser({ id: userId, username: input.username, passwordHash, displayName: input.username, phone: input.phone, phoneVerifiedAt: new Date(), provinceId: province.id, email: owner ? null : input.email }, tx);
      return this.sessions.create(user, tx);
    });
  }
  /** Uses a dummy Argon2 verification for unknown usernames and serializes session issuance with revocation. */
  async passwordLogin(input: z.infer<typeof passwordLoginSchema>) {
    await this.ephemeral.limit(`password:${input.username}`, this.ephemeral.limits.password.maximum, this.ephemeral.limits.password.seconds);
    const candidate = await this.repository.user({ username: input.username });
    if (!await verifyPassword(candidate?.passwordHash ?? await this.dummyHash, input.password) || !candidate?.passwordHash) throw unauthorized();
    return this.repository.transaction(async (tx) => {
      await this.repository.lock(tx, candidate.id);
      const current = await this.repository.user({ id: candidate.id }, tx);
      if (!current || current.passwordHash !== candidate.passwordHash) throw unauthorized();
      return this.sessions.create(current, tx);
    });
  }
  /** Consumes a code for its original account only while the verified phone ownership remains locked. */
  async phoneLogin(input: z.infer<typeof phoneLoginSchema>) {
    const candidate = await this.repository.contact(input.phone);
    if (!candidate) throw unauthorized();
    return this.repository.transaction(async (tx) => {
      await this.repository.lock(tx, candidate.id);
      const current = await this.repository.contact(input.phone, tx);
      if (!current || current.id !== candidate.id) throw unauthorized();
      await this.ephemeral.consumeOtp(otpBinding("LOGIN_PHONE", input.phone, { userId: current.id }), input.challengeId, input.code);
      return this.sessions.create(current, tx);
    });
  }
  /** Issues an unpredictable one-use nonce; a supplied session binds login/link re-auth separately. */
  async challenge(principal?: Principal) {
    const challengeId = await this.ephemeral.issueProof(`google:${principal?.sessionId ?? "anonymous"}`);
    return { challengeId, nonce: challengeId, expiresIn: 300 };
  }
  /** Verifies the nonce before provider assertions, preventing replay across login and linked sessions. */
  async verifyGoogle(input: z.infer<typeof googleSchema>, principal?: Principal) {
    await this.ephemeral.consumeProof(input.challengeId, `google:${principal?.sessionId ?? "anonymous"}`);
    return this.google.verify(input.credential, input.challengeId);
  }
  /** Creates a Google User with a generated unique username, but never merges by matching email. */
  async googleLogin(input: z.infer<typeof googleSchema>) {
    const identity = await this.verifyGoogle(input); const userId = randomUUID();
    return this.repository.transaction(async (tx) => {
      await lockResources(tx, [`google:${identity.subject}`, ...(identity.email ? [`email:${identity.email}`] : [])]);
      const linked = await this.repository.google(identity.subject, tx);
      if (linked) {
        await this.repository.lock(tx, linked.userId);
        const user = await this.repository.user({ id: linked.userId }, tx);
        if (!user) throw unauthorized();
        return this.sessions.create(user, tx);
      }
      const emailOwner = identity.email ? await this.repository.contact(identity.email, tx) : null;
      if (identity.verified && emailOwner) throw conflict("Sign in to the existing account and explicitly link Google after re-authentication.");
      if (identity.verified && identity.email) await this.repository.lockContact(tx, userId, identity.email);
      const user = await this.repository.createUser({ id: userId, username: `g_${randomUUID().replaceAll("-", "").slice(0, 24)}`, displayName: [...(identity.name || "Người dùng Google")].slice(0, 60).join(""), email: emailOwner ? null : identity.email, emailVerifiedAt: identity.verified && identity.email ? new Date() : null }, tx);
      if (identity.verified && identity.email) await this.repository.verifiedContact(user.id, identity.email, tx);
      await this.repository.linkGoogle(user.id, identity.subject, tx);
      return this.sessions.create(user, tx);
    });
  }
  /** Links only the authenticated User after one-use action proof; another subject owner cannot be overwritten. */
  async link(principal: Principal, input: z.infer<typeof googleSchema> & { reauthProof: string }): Promise<void> {
    await this.consumeReauth(principal, "LINK_GOOGLE", input.reauthProof);
    const identity = await this.verifyGoogle(input, principal);
    await this.repository.transaction(async (tx) => {
      await this.repository.lock(tx, principal.userId, [`google:${identity.subject}`]);
      await this.sessions.requireCurrent(principal, tx);
      const owner = await this.repository.google(identity.subject, tx);
      const existing = await this.repository.googleForUser(principal.userId, tx);
      if ((owner && owner.userId !== principal.userId) || (existing && existing.googleSubject !== identity.subject)) throw conflict("This Google identity cannot be linked.");
      if (!owner) await this.repository.linkGoogle(principal.userId, identity.subject, tx);
    });
  }
  /** Public Auth boundary used by User account mutations for exact action/session authorization. */
  async consumeReauth(principal: Principal, operation: SensitiveOperation, proof: string): Promise<void> {
    await this.ephemeral.consumeProof(proof, this.ephemeral.reauthBinding(principal.sessionId, operation));
  }
}
