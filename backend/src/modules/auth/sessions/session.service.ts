import type { User } from "../../../generated/prisma/client";
import type { DatabaseTransaction } from "../../../shared/database/prisma";
import type { AuthRepository } from "../auth.repository";
import type { IssuedSession, Principal } from "../auth.types";
import { unauthorized, forbidden } from "../auth.errors";
import { digest, secret } from "../security/random";
import type { AccessTokens } from "../security/access-tokens";

export class SessionService {
  /** Shares token validation and persistent session checks across HTTP and feature services. */
  constructor(private readonly repository: AuthRepository, private readonly tokens: AccessTokens) {}
  /** Creates a seven-day absolute session while its User is locked by the enclosing transaction. */
  async create(user: User, tx: DatabaseTransaction): Promise<IssuedSession> {
    if (user.status === "DELETING" || user.status === "DELETED") throw unauthorized();
    const refreshToken = secret();
    const session = await this.repository.createSession(user.id, digest(refreshToken), new Date(Date.now() + 7 * 86400000), tx);
    return { accessToken: await this.tokens.issue(user.id, session.id), refreshToken, expiresIn: 900, status: user.status };
  }
  /** Rejects revoked/expired sessions on every Access Token authentication, including after password reset. */
  async authenticate(token: string, active = true): Promise<Principal> {
    const claims = await this.tokens.verify(token);
    const session = await this.repository.session({ id: claims.sessionId });
    if (!session || session.userId !== claims.userId || session.revokedAt || session.expiresAt.getTime() <= Date.now() || ["DELETED", "DELETING"].includes(session.user.status)) throw unauthorized();
    if (active && session.user.status !== "ACTIVE") throw forbidden();
    return { userId: session.userId, sessionId: session.id, status: session.user.status };
  }
  /** Rechecks the session/account after acquiring a mutation lock, closing authenticate-then-revoke races. */
  async requireCurrent(principal: Principal, tx: DatabaseTransaction, active = true): Promise<User> {
    const session = await this.repository.session({ id: principal.sessionId }, tx);
    if (!session || session.userId !== principal.userId || session.revokedAt || session.expiresAt.getTime() <= Date.now()) throw unauthorized();
    if (active ? session.user.status !== "ACTIVE" : !["ACTIVE", "PENDING_DELETION"].includes(session.user.status)) throw forbidden();
    return session.user;
  }
  /** Serializes rotation with password/deletion revocation; only one old-token request can succeed. */
  async refresh(token: string): Promise<IssuedSession> {
    const oldHash = digest(token); const candidate = await this.repository.session({ refreshTokenHash: oldHash });
    if (!candidate) throw unauthorized();
    return this.repository.transaction(async (tx) => {
      await this.repository.lock(tx, candidate.userId);
      const session = await this.repository.session({ id: candidate.id }, tx);
      if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now() || !["ACTIVE", "PENDING_DELETION"].includes(session.user.status)) throw unauthorized();
      const refreshToken = secret(); const updated = await this.repository.rotate(session.id, oldHash, digest(refreshToken), tx);
      if (updated.count !== 1) throw unauthorized();
      return { accessToken: await this.tokens.issue(session.userId, session.id), expiresIn: 900, refreshToken, status: session.user.status };
    });
  }
  /** Revokes a cookie's session without revealing whether the cookie existed. */
  async logout(token: string): Promise<void> {
    const session = await this.repository.session({ refreshTokenHash: digest(token) });
    if (session) await this.repository.revokeOne(session.userId, session.id);
  }
  /** Projects safe multi-device session metadata and identifies the requesting session. */
  async list(principal: Principal) { return (await this.repository.sessions(principal.userId)).map((session) => ({ ...session, current: session.id === principal.sessionId })); }
  /** Never accepts another User's session ID as authority. */
  async revoke(principal: Principal, id: string): Promise<void> { await this.repository.revokeOne(principal.userId, id); }
  /** Public deletion boundary; the coordinator already owns the User lock and transaction. */
  async revokeAll(userId: string, tx: DatabaseTransaction): Promise<void> { await this.repository.revoke(userId, tx); }
}
