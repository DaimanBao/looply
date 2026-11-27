import type { User } from "../../generated/prisma/client";
import type { DatabaseTransaction } from "../../shared/database/prisma";
import type { AuthRepository } from "./auth.repository";
import type { IssuedSession, Principal } from "./auth.types";
import { unauthorized, forbidden } from "./auth.errors";
import { digest, secret } from "./security/random";
import type { AccessTokens } from "./security/access-tokens";

export const authSessionLifetimeSeconds = 7 * 86400;

export class SessionService {
  /** Dùng chung kiểm tra token và phiên đã lưu cho HTTP và service feature. */
  constructor(
    private readonly repository: AuthRepository,
    private readonly tokens: AccessTokens,
  ) {}

  /** Tạo phiên tuyệt đối bảy ngày trong khi transaction bao ngoài khóa User. */
  async create(user: User, tx: DatabaseTransaction): Promise<IssuedSession> {
    if (user.status === "DELETING" || user.status === "DELETED") throw unauthorized();
    const refreshToken = secret();
    const session = await this.repository.createSession(
      user.id,
      digest(refreshToken),
      new Date(Date.now() + authSessionLifetimeSeconds * 1000),
      tx,
    );
    return {
      accessToken: await this.tokens.issue(user.id, session.id),
      refreshToken,
      expiresIn: 900,
      status: user.status,
    };
  }

  /** Từ chối phiên bị thu hồi/hết hạn mỗi lần xác thực Access Token, kể cả sau đặt lại mật khẩu. */
  async authenticate(token: string, active = true): Promise<Principal> {
    const claims = await this.tokens.verify(token);
    const session = await this.repository.session({ id: claims.sessionId });
    if (
      !session ||
      session.userId !== claims.userId ||
      session.revokedAt ||
      session.expiresAt.getTime() <= Date.now() ||
      ["DELETED", "DELETING"].includes(session.user.status)
    )
      throw unauthorized();
    if (active && session.user.status !== "ACTIVE") throw forbidden();
    return { userId: session.userId, sessionId: session.id, status: session.user.status };
  }

  /** Kiểm tra lại phiên/tài khoản sau khi lấy khóa thay đổi, ngăn race giữa xác thực và thu hồi. */
  async requireCurrent(
    principal: Principal,
    tx: DatabaseTransaction,
    active = true,
  ): Promise<User> {
    const session = await this.repository.session({ id: principal.sessionId }, tx);
    if (
      !session ||
      session.userId !== principal.userId ||
      session.revokedAt ||
      session.expiresAt.getTime() <= Date.now()
    )
      throw unauthorized();
    if (
      active
        ? session.user.status !== "ACTIVE"
        : !["ACTIVE", "PENDING_DELETION"].includes(session.user.status)
    )
      throw forbidden();
    return session.user;
  }

  /** Tuần tự hóa luân chuyển token với thu hồi do mật khẩu/xóa; chỉ một yêu cầu token cũ thành công. */
  async refresh(token: string): Promise<IssuedSession> {
    const oldHash = digest(token);
    const candidate = await this.repository.session({ refreshTokenHash: oldHash });
    if (!candidate) throw unauthorized();
    return this.repository.transaction(async (tx) => {
      await this.repository.lock(tx, candidate.userId);
      const session = await this.repository.session({ id: candidate.id }, tx);
      if (
        !session ||
        session.revokedAt ||
        session.expiresAt.getTime() <= Date.now() ||
        !["ACTIVE", "PENDING_DELETION"].includes(session.user.status)
      )
        throw unauthorized();
      const refreshToken = secret();
      const updated = await this.repository.rotate(session.id, oldHash, digest(refreshToken), tx);
      if (updated.count !== 1) throw unauthorized();
      return {
        accessToken: await this.tokens.issue(session.userId, session.id),
        expiresIn: 900,
        refreshToken,
        status: session.user.status,
      };
    });
  }

  /** Thu hồi phiên cookie mà không tiết lộ cookie có tồn tại hay không. */
  async logout(token: string): Promise<void> {
    const session = await this.repository.session({ refreshTokenHash: digest(token) });
    if (session) await this.repository.revokeOne(session.userId, session.id);
  }

  /** Chiếu metadata phiên nhiều thiết bị an toàn và xác định phiên yêu cầu. */
  async list(principal: Principal) {
    return (await this.repository.sessions(principal.userId)).map((session) => ({
      ...session,
      current: session.id === principal.sessionId,
    }));
  }

  /** Không chấp nhận ID phiên của User khác làm quyền truy cập. */
  async revoke(principal: Principal, id: string): Promise<void> {
    await this.repository.revokeOne(principal.userId, id);
  }

  /** Giao diện xóa công khai; bộ điều phối đã giữ khóa User và transaction. */
  async revokeAll(userId: string, tx: DatabaseTransaction): Promise<void> {
    await this.repository.revoke(userId, tx);
  }
}
