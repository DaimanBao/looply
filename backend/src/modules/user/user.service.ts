import type { z } from "zod";
import type { profileSchema, pageSchema } from "./user.schema";
import type { UserRepository } from "./user.repository";
import type { SessionService, Principal } from "../auth";
import type { DatabaseTransaction } from "../../shared/database/prisma";
import { AppError } from "../../shared/errors/app-error";
import { conflict, forbidden } from "../auth";
import type { User } from "../../generated/prisma/client";

type Profile = NonNullable<Awaited<ReturnType<UserRepository["profile"]>>>;
/** Public Chat integration boundary: deleted actors expose no old username, avatar or display name. */
export function historyIdentity(user: Pick<User, "id" | "status" | "username" | "displayName" | "avatarMediaId">) {
  const deleted = user.status === "DELETED";
  return { id: user.id, username: deleted ? null : user.username, displayName: deleted ? "Tài khoản đã xóa" : user.displayName, avatarUrl: !deleted && user.avatarMediaId ? `/api/users/${user.id}/avatar` : null };
}
/** Serializes only public data; a deleted actor's historical identity never includes old profile values. */
export function publicProfile(user: Profile) {
  const deleted = user.status === "DELETED";
  return { ...historyIdentity(user), bio: deleted ? null : user.bio, province: deleted ? null : user.province, followers: user._count.followerRelations, following: user._count.followingRelations };
}
/** Adds private contact/account state only to the owner's explicit DTO. */
export function privateProfile(user: Profile) {
  return { ...publicProfile(user), email: user.email, emailVerifiedAt: user.emailVerifiedAt, phone: user.phone, phoneVerifiedAt: user.phoneVerifiedAt, status: user.status, deletionRequestedAt: user.deletionRequestedAt, usernameChangedAt: user.usernameChangedAt };
}
export class UserService {
  /** Uses Auth's public session gate rather than implementing a second identity validator. */
  constructor(private readonly repository: UserRepository, private readonly sessions: SessionService) {}
  /** Reads the owner's private profile, including deletion state needed to explicitly cancel deletion. */
  async me(principal: Principal) {
    const user = await this.repository.profile(principal.userId);
    if (!user || !["ACTIVE", "PENDING_DELETION"].includes(user.status)) throw forbidden();
    return privateProfile(user);
  }
  /** Hides pending/deleting/deleted profiles and bidirectionally blocked profiles from signed-in viewers. */
  async profile(userId: string, viewer?: Principal) {
    const user = await this.repository.visibleProfile(userId, viewer?.userId);
    if (!user) throw new AppError(404, "NOT_FOUND", "Profile not found.");
    return publicProfile(user);
  }
  /** Validates province at the server and updates only profile-owned fields while the session remains current. */
  async update(principal: Principal, input: z.infer<typeof profileSchema>) {
    await this.repository.transaction(async (tx) => {
      await this.repository.lock(tx, [principal.userId]); await this.sessions.requireCurrent(principal, tx);
      const province = input.provinceCode ? await this.repository.province(input.provinceCode, tx) : null;
      if (input.provinceCode && !province) throw new AppError(400, "INVALID_PROVINCE", "Choose an active province.");
      await this.repository.update(principal.userId, { displayName: input.displayName, bio: input.bio, ...(province ? { province: { connect: { id: province.id } } } : {}) }, tx);
    });
    return this.me(principal);
  }
  /** Enforces the first-change/30-day rule atomically; uniqueness remains protected by PostgreSQL. */
  async username(principal: Principal, username: string) {
    await this.repository.transaction(async (tx) => {
      await this.repository.lock(tx, [principal.userId]); const current = await this.sessions.requireCurrent(principal, tx);
      if (current.username === username) return;
      const result = await this.repository.username(principal.userId, username, tx);
      if (result.count !== 1) throw conflict("Wait 30 days after your last username change.");
    });
    return this.me(principal);
  }
  /** Public transactional access gate for future Chat/Listing sends; locks must remain held until the write commits. */
  async requireInteraction(tx: DatabaseTransaction, from: string, to: string): Promise<void> {
    from = from.toLowerCase(); to = to.toLowerCase();
    if (from === to) throw forbidden();
    await this.repository.lock(tx, [from, to]);
    if (!await this.repository.visible(from, undefined, tx) || !await this.repository.visible(to, undefined, tx) || await this.repository.blocked(from, to, tx)) throw forbidden();
  }
  /** Serializes both sides against Follow/Block and account deletion; no notification is created. */
  async relationship(principal: Principal, target: string, operation: "follow" | "unfollow" | "block" | "unblock"): Promise<void> {
    target = target.toLowerCase();
    if (target === principal.userId) throw forbidden();
    await this.repository.transaction(async (tx) => {
      await this.repository.lock(tx, [principal.userId, target]); await this.sessions.requireCurrent(principal, tx);
      if (operation === "follow") {
        await this.requireInteraction(tx, principal.userId, target); await this.repository.follow(principal.userId, target, tx);
      } else if (operation === "unfollow") await this.repository.unfollow(principal.userId, target, tx);
      else if (operation === "unblock") await this.repository.unblock(principal.userId, target, tx);
      else {
        if (!await this.repository.visible(target, undefined, tx)) throw forbidden();
        await this.repository.block(principal.userId, target, tx);
      }
    });
  }
  /** Returns a stable cursor and safe projections, never another User's email/phone or credentials. */
  async related(userId: string, kind: "followers" | "following" | "blocked", page: z.infer<typeof pageSchema>, viewer?: Principal) {
    if (kind === "blocked") { if (viewer?.userId !== userId) throw forbidden(); }
    else await this.profile(userId, viewer);
    const rows = await this.repository.related(userId, kind, page.limit, page.after, viewer?.userId);
    const data = rows.slice(0, page.limit);
    return { data: data.map(publicProfile), pagination: { nextCursor: rows.length > page.limit ? data[data.length - 1]?.id ?? null : null } };
  }
  /** Exposes only the active Province catalog without requiring authentication. */
  provinces() { return this.repository.provinces(); }
}
