import { randomUUID } from "node:crypto";
import type { z } from "zod";
import type {
  registerSchema,
  passwordLoginSchema,
  phoneLoginSchema,
  googleSchema,
} from "./auth.schema";
import type { AuthRepository } from "./auth.repository";
import type { SessionService } from "./session.service";
import type { EphemeralAuth } from "./redis/ephemeral-auth";
import type { GoogleVerifier, PasswordScreen, Principal } from "./auth.types";
import { conflict, unauthorized } from "./auth.errors";
import { hashPassword, verifyPassword } from "./security/password";
import { otpBinding } from "./otp.service";
import { lockResources } from "../../shared/database/locks";
import { AppError } from "../../shared/errors/app-error";

export class IdentityService {
  private readonly dummyHash = hashPassword(randomUUID());

  /** Nhận tường minh các giao diện provider và service lưu trữ. */
  constructor(
    private readonly repository: AuthRepository,
    private readonly sessions: SessionService,
    private readonly ephemeral: EphemeralAuth,
    private readonly google: GoogleVerifier,
    private readonly passwords: PasswordScreen,
  ) {}

  /** Kiểm tra/băm trước transaction, rồi tạo điện thoại đã xác minh và phiên trong một commit database. */
  async register(input: z.infer<typeof registerSchema>) {
    await this.passwords.check(input.password);
    const passwordHash = await hashPassword(input.password);
    const userId = randomUUID();
    return this.repository.transaction(async (tx) => {
      await this.repository.lock(tx, userId, input.email ? [`email:${input.email}`] : []);
      const province = await this.repository.province(input.provinceCode, tx);
      if (!province) throw new AppError(400, "INVALID_PROVINCE", "Choose an active province.");
      await this.ephemeral.consumeOtp(
        otpBinding("REGISTER_PHONE", input.phone),
        input.challengeId,
        input.code,
      );
      const owner = input.email ? await this.repository.contact(input.email, tx) : null;
      const user = await this.repository.createUser(
        {
          id: userId,
          username: input.username,
          passwordHash,
          displayName: input.username,
          phone: input.phone,
          phoneVerifiedAt: new Date(),
          provinceId: province.id,
          email: owner ? null : input.email,
        },
        tx,
      );
      return this.sessions.create(user, tx);
    });
  }

  /** Dùng xác minh Argon2 giả cho username không tồn tại và tuần tự hóa cấp phiên với thu hồi. */
  async passwordLogin(input: z.infer<typeof passwordLoginSchema>) {
    await this.ephemeral.limit(
      `password:${input.username}`,
      this.ephemeral.limits.password.maximum,
      this.ephemeral.limits.password.seconds,
    );
    const candidate = await this.repository.user({ username: input.username });
    const passwordHash = candidate?.passwordHash;
    const matches = await verifyPassword(passwordHash ?? (await this.dummyHash), input.password);
    if (!candidate || !passwordHash || !matches) throw unauthorized();
    return this.repository.transaction(async (tx) => {
      await this.repository.lock(tx, candidate.id);
      const current = await this.repository.user({ id: candidate.id }, tx);
      if (!current || current.passwordHash !== passwordHash) throw unauthorized();
      return this.sessions.create(current, tx);
    });
  }

  /** Chỉ tiêu thụ mã cho tài khoản gốc trong khi vẫn khóa quyền sở hữu điện thoại đã xác minh. */
  async phoneLogin(input: z.infer<typeof phoneLoginSchema>) {
    const candidate = await this.repository.contact(input.phone);
    if (!candidate) throw unauthorized();
    return this.repository.transaction(async (tx) => {
      await this.repository.lock(tx, candidate.id);
      const current = await this.repository.contact(input.phone, tx);
      if (!current || current.id !== candidate.id) throw unauthorized();
      await this.ephemeral.consumeOtp(
        otpBinding("LOGIN_PHONE", input.phone, { userId: current.id }),
        input.challengeId,
        input.code,
      );
      return this.sessions.create(current, tx);
    });
  }

  /** Cấp nonce khó đoán dùng một lần; phiên được truyền gắn riêng việc xác thực lại khi đăng nhập/liên kết. */
  async challenge(principal?: Principal) {
    const challengeId = await this.ephemeral.issueProof(
      `google:${principal?.sessionId ?? "anonymous"}`,
    );
    return { challengeId, nonce: challengeId, expiresIn: 300 };
  }

  /** Kiểm tra nonce trước assertion của provider, ngăn phát lại giữa đăng nhập và phiên đã liên kết. */
  async verifyGoogle(input: z.infer<typeof googleSchema>, principal?: Principal) {
    await this.ephemeral.consumeProof(
      input.challengeId,
      `google:${principal?.sessionId ?? "anonymous"}`,
    );
    return this.google.verify(input.credential, input.challengeId);
  }

  /** Tạo User Google với username duy nhất được sinh tự động, không hợp nhất theo email trùng. */
  async googleLogin(input: z.infer<typeof googleSchema>) {
    const identity = await this.verifyGoogle(input);
    const userId = randomUUID();
    return this.repository.transaction(async (tx) => {
      await lockResources(tx, [
        `google:${identity.subject}`,
        ...(identity.email ? [`email:${identity.email}`] : []),
      ]);
      const linked = await this.repository.google(identity.subject, tx);
      if (linked) {
        await this.repository.lock(tx, linked.userId);
        const user = await this.repository.user({ id: linked.userId }, tx);
        if (!user) throw unauthorized();
        return this.sessions.create(user, tx);
      }
      const emailOwner = identity.email ? await this.repository.contact(identity.email, tx) : null;
      if (identity.verified && emailOwner)
        throw conflict(
          "Sign in to the existing account and explicitly link Google after re-authentication.",
        );
      if (identity.verified && identity.email)
        await this.repository.lockContact(tx, userId, identity.email);
      const user = await this.repository.createUser(
        {
          id: userId,
          username: `g_${randomUUID().replaceAll("-", "").slice(0, 24)}`,
          displayName: [...(identity.name || "Người dùng Google")].slice(0, 60).join(""),
          email: emailOwner ? null : identity.email,
          emailVerifiedAt: identity.verified && identity.email ? new Date() : null,
        },
        tx,
      );
      if (identity.verified && identity.email)
        await this.repository.verifiedContact(user.id, identity.email, tx);
      await this.repository.linkGoogle(user.id, identity.subject, tx);
      return this.sessions.create(user, tx);
    });
  }

  /** Chỉ liên kết User đã xác thực sau proof thao tác dùng một lần; không ghi đè chủ subject khác. */
  async link(
    principal: Principal,
    input: z.infer<typeof googleSchema> & { reauthProof: string },
  ): Promise<void> {
    await this.ephemeral.consumeReauth(principal.sessionId, "LINK_GOOGLE", input.reauthProof);
    const identity = await this.verifyGoogle(input, principal);
    await this.repository.transaction(async (tx) => {
      await this.repository.lock(tx, principal.userId, [`google:${identity.subject}`]);
      await this.sessions.requireCurrent(principal, tx);
      const owner = await this.repository.google(identity.subject, tx);
      const existing = await this.repository.googleForUser(principal.userId, tx);
      if (
        (owner && owner.userId !== principal.userId) ||
        (existing && existing.googleSubject !== identity.subject)
      )
        throw conflict("This Google identity cannot be linked.");
      if (!owner) await this.repository.linkGoogle(principal.userId, identity.subject, tx);
    });
  }
}
