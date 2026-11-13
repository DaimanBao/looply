import type { PrismaClient, Prisma } from "../../generated/prisma/client";
import type { DatabaseTransaction } from "../../shared/database/prisma";
import { lockResources } from "../../shared/database/locks";

/** Builds the same bidirectional block predicate for profiles, relationship lists and feature access. */
export function visibleUserWhere(viewerId?: string): Prisma.UserWhereInput {
  return { status: "ACTIVE", ...(viewerId ? { NOT: { OR: [{ blockingRelations: { some: { blockedId: viewerId } } }, { blockedRelations: { some: { blockerId: viewerId } } }] } } : {}) };
}
export class UserRepository {
  /** Shares the application Prisma pool; no module-global connection is created. */
  constructor(private readonly db: PrismaClient) {}
  /** Owns the atomic database boundary for profile and relationship changes. */
  transaction<T>(run: (tx: DatabaseTransaction) => Promise<T>): Promise<T> { return this.db.$transaction(run, { timeout: 15000 }); }
  /** Uses canonical User locks shared with Auth, worker and future Chat/Listing mutation gates. */
  lock(tx: DatabaseTransaction, ids: string[]): Promise<void> { return lockResources(tx, ids.map((id) => `user:${id.toLowerCase()}`)); }
  /** Fetches profile data and actual relationship counts in one ORM query. */
  profile(id: string, tx: DatabaseTransaction = this.db) {
    return tx.user.findUnique({ where: { id }, include: { province: { select: { code: true, name: true } }, _count: { select: { followerRelations: true, followingRelations: true } } } });
  }
  /** Looks up only visible accounts for public profile access. */
  visible(id: string, viewerId?: string, tx: DatabaseTransaction = this.db) { return tx.user.findFirst({ where: { id, ...visibleUserWhere(viewerId) }, select: { id: true } }); }
  /** Combines visibility and profile selection in one statement to avoid a check-then-read race. */
  visibleProfile(id: string, viewerId?: string) { return this.db.user.findFirst({ where: { id, ...visibleUserWhere(viewerId) }, include: { province: { select: { code: true, name: true } }, _count: { select: { followerRelations: true, followingRelations: true } } } }); }
  /** Resolves both active Province validation and the public reference catalog from PostgreSQL. */
  provinces() { return this.db.province.findMany({ where: { isActive: true }, select: { code: true, name: true }, orderBy: { code: "asc" } }); }
  /** Rejects inactive or unknown codes before assigning the FK. */
  province(code: string, tx: DatabaseTransaction) { return tx.province.findFirst({ where: { code, isActive: true }, select: { id: true } }); }
  /** Updates only service-selected profile fields; never accepts arbitrary HTTP data as Prisma input. */
  update(id: string, data: Prisma.UserUpdateInput, tx: DatabaseTransaction) { return tx.user.update({ where: { id }, data }); }
  /** Applies the username cooldown as a database predicate, not a check-then-write race. */
  username(id: string, username: string, tx: DatabaseTransaction) {
    return tx.user.updateMany({ where: { id, status: "ACTIVE", OR: [{ usernameChangedAt: null }, { usernameChangedAt: { lte: new Date(Date.now() - 30 * 86400000) } }] }, data: { username, usernameChangedAt: new Date() } });
  }
  /** Checks blocking in both directions while retaining each owner's directional block row. */
  blocked(left: string, right: string, tx: DatabaseTransaction = this.db) { return tx.userBlock.findFirst({ where: { OR: [{ blockerId: left, blockedId: right }, { blockerId: right, blockedId: left }] }, select: { id: true } }); }
  /** Makes following idempotent with the existing composite unique key. */
  follow(from: string, to: string, tx: DatabaseTransaction) { return tx.userFollow.upsert({ where: { followerId_followingId: { followerId: from, followingId: to } }, create: { followerId: from, followingId: to }, update: {} }); }
  /** Removes just the caller-owned follow direction. */
  unfollow(from: string, to: string, tx: DatabaseTransaction) { return tx.userFollow.deleteMany({ where: { followerId: from, followingId: to } }); }
  /** Deletes Follow in both directions atomically with inserting a Block. */
  async block(from: string, to: string, tx: DatabaseTransaction): Promise<void> {
    await tx.userFollow.deleteMany({ where: { OR: [{ followerId: from, followingId: to }, { followerId: to, followingId: from }] } });
    await tx.userBlock.upsert({ where: { blockerId_blockedId: { blockerId: from, blockedId: to } }, create: { blockerId: from, blockedId: to }, update: {} });
  }
  /** Never removes the other User's independent Block or restores Follow on unblock. */
  unblock(from: string, to: string, tx: DatabaseTransaction) { return tx.userBlock.deleteMany({ where: { blockerId: from, blockedId: to } }); }
  /** Paginates by immutable UUID with a bounded query; filters the selected User relation server-side. */
  related(id: string, kind: "followers" | "following" | "blocked", limit: number, after?: string, viewerId?: string) {
    const relation: Prisma.UserWhereInput = kind === "followers" ? { followingRelations: { some: { followingId: id } } } : kind === "following" ? { followerRelations: { some: { followerId: id } } } : { blockedRelations: { some: { blockerId: id } } };
    return this.db.user.findMany({ where: { ...relation, ...(kind === "blocked" ? { status: "ACTIVE" } : visibleUserWhere(viewerId)), ...(after ? { id: { gt: after } } : {}) }, include: { province: { select: { code: true, name: true } }, _count: { select: { followerRelations: true, followingRelations: true } } }, orderBy: { id: "asc" }, take: limit + 1 });
  }
}
