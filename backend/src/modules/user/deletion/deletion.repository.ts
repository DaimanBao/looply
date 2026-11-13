import type { PrismaClient } from "../../../generated/prisma/client";
import type { DatabaseTransaction } from "../../../shared/database/prisma";
import { lockResources } from "../../../shared/database/locks";
import { randomBytes } from "node:crypto";

export const deletionEventType = "account.delete";
export class DeletionRepository {
  /** Uses the existing User lifecycle and outbox; no new schema is required. */
  constructor(private readonly db: PrismaClient) {}
  /** Runs lifecycle and cleanup database phases as atomic units. */
  transaction<T>(run: (tx: DatabaseTransaction) => Promise<T>): Promise<T> { return this.db.$transaction(run, { timeout: 15000 }); }
  /** Shares locks with login, refresh, profile and interaction mutation gates. */
  lock(userId: string, tx: DatabaseTransaction) { return lockResources(tx, [`user:${userId}`]); }
  /** Reads fresh lifecycle state after acquiring its mutation lock. */
  user(userId: string, tx: DatabaseTransaction = this.db) { return tx.user.findUnique({ where: { id: userId } }); }
  /** Persists the request and durable due event in the same transaction. */
  async request(userId: string, tx: DatabaseTransaction): Promise<void> {
    const now = new Date();
    await tx.user.update({ where: { id: userId }, data: { status: "PENDING_DELETION", deletionRequestedAt: now } });
    await tx.outboxEvent.create({ data: { eventType: deletionEventType, aggregateType: "User", aggregateId: userId, payload: { requestedAt: now.toISOString() }, nextRetryAt: new Date(now.getTime() + 30 * 86400000) } });
  }
  /** Cancels only the explicit pending request; old events are harmless because they carry its timestamp. */
  async cancel(userId: string, tx: DatabaseTransaction) {
    const result = await tx.user.updateMany({ where: { id: userId, status: "PENDING_DELETION" }, data: { status: "ACTIVE", deletionRequestedAt: null } });
    if (result.count) await tx.outboxEvent.updateMany({ where: { aggregateId: userId, eventType: deletionEventType, status: { not: "PROCESSED" } }, data: { status: "PROCESSED", processedAt: new Date(), lockedUntil: null } });
    return result;
  }
  /** Claims a due request irreversibly and rechecks the captured timestamp to reject stale/cancelled jobs. */
  start(userId: string, requestedAt: Date, tx: DatabaseTransaction) {
    return tx.user.updateMany({ where: { id: userId, status: "PENDING_DELETION", deletionRequestedAt: requestedAt, AND: { deletionRequestedAt: { lte: new Date(Date.now() - 30 * 86400000) } } }, data: { status: "DELETING" } });
  }
  /** Clears live avatar references before physical deletion, preserving every Chat relationship. */
  async prepare(userId: string, tx: DatabaseTransaction): Promise<void> {
    await tx.user.update({ where: { id: userId }, data: { avatarMediaId: null } });
  }
  /** Removes PII and credentials while retaining User UUID and all chat/proposal history references. */
  async finish(userId: string, tx: DatabaseTransaction): Promise<void> {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    const listings = await tx.listing.findMany({ where: { ownerId: userId }, select: { id: true } });
    const listingIds = listings.map((listing) => listing.id);
    await tx.listing.updateMany({ where: { ownerId: userId }, data: { status: "DELETED", deletedAt: new Date(), title: "Bài đăng đã xóa", searchTitle: "bai dang da xoa", description: "Nội dung bài đăng đã được xóa.", contactPhone: null } });
    await tx.userFollow.deleteMany({ where: { OR: [{ followerId: userId }, { followingId: userId }] } });
    await tx.userBlock.deleteMany({ where: { OR: [{ blockerId: userId }, { blockedId: userId }] } });
    await tx.listingFollow.deleteMany({ where: { OR: [{ userId }, { listingId: { in: listingIds } }] } });
    await tx.notification.deleteMany({ where: { recipientId: userId } });
    await tx.outboxEvent.updateMany({ where: { aggregateId: { in: [userId, ...listingIds] }, eventType: { not: deletionEventType } }, data: { payload: {}, lastError: null, status: "PROCESSED", processedAt: new Date(), lockedUntil: null } });
    const alreadyAnonymous = user.status === "DELETED" && user.displayName === "Tài khoản đã xóa" && !user.passwordHash && !user.email && !user.phone;
    await tx.user.update({ where: { id: userId }, data: { username: alreadyAnonymous ? user.username : `d_${randomBytes(14).toString("hex")}`, displayName: "Tài khoản đã xóa", bio: null, provinceId: null, avatarMediaId: null, usernameChangedAt: null, status: "DELETED", deletionRequestedAt: null } });
  }
}
