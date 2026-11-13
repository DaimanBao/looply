import type { PrismaClient } from "../../../generated/prisma/client";
import type { DatabaseTransaction } from "../../../shared/database/prisma";
import { lockResources } from "../../../shared/database/locks";
import { randomBytes } from "node:crypto";

export const deletionEventType = "account.delete";
export class DeletionRepository {
  /** Dùng vòng đời User và outbox hiện có; không cần schema mới. */
  constructor(private readonly db: PrismaClient) {}

  /** Chạy các giai đoạn database của vòng đời và cleanup như đơn vị nguyên tử. */
  transaction<T>(run: (tx: DatabaseTransaction) => Promise<T>): Promise<T> {
    return this.db.$transaction(run, { timeout: 15000 });
  }

  /** Dùng chung khóa với login, refresh, hồ sơ và cổng thay đổi tương tác. */
  lock(userId: string, tx: DatabaseTransaction) {
    return lockResources(tx, [`user:${userId}`]);
  }

  /** Đọc trạng thái vòng đời mới sau khi lấy khóa thay đổi. */
  user(userId: string, tx: DatabaseTransaction = this.db) {
    return tx.user.findUnique({ where: { id: userId } });
  }

  /** Lưu yêu cầu và sự kiện đến hạn bền vững trong cùng transaction. */
  async request(userId: string, tx: DatabaseTransaction): Promise<void> {
    const now = new Date();
    await tx.user.update({
      where: { id: userId },
      data: { status: "PENDING_DELETION", deletionRequestedAt: now },
    });
    await tx.outboxEvent.create({
      data: {
        eventType: deletionEventType,
        aggregateType: "User",
        aggregateId: userId,
        payload: { requestedAt: now.toISOString() },
        nextRetryAt: new Date(now.getTime() + 30 * 86400000),
      },
    });
  }

  /** Chỉ hủy yêu cầu đang chờ tường minh; sự kiện cũ vô hại nhờ mang timestamp của yêu cầu. */
  async cancel(userId: string, tx: DatabaseTransaction) {
    const result = await tx.user.updateMany({
      where: { id: userId, status: "PENDING_DELETION" },
      data: { status: "ACTIVE", deletionRequestedAt: null },
    });
    if (result.count)
      await tx.outboxEvent.updateMany({
        where: { aggregateId: userId, eventType: deletionEventType, status: { not: "PROCESSED" } },
        data: { status: "PROCESSED", processedAt: new Date(), lockedUntil: null },
      });
    return result;
  }

  /** Nhận yêu cầu đến hạn không thể đảo ngược và kiểm tra timestamp đã ghi để từ chối job cũ/đã hủy. */
  start(userId: string, requestedAt: Date, tx: DatabaseTransaction) {
    return tx.user.updateMany({
      where: {
        id: userId,
        status: "PENDING_DELETION",
        deletionRequestedAt: requestedAt,
        AND: { deletionRequestedAt: { lte: new Date(Date.now() - 30 * 86400000) } },
      },
      data: { status: "DELETING" },
    });
  }

  /** Xóa tham chiếu avatar hiện hành trước xóa vật lý, giữ mọi quan hệ Chat. */
  async prepare(userId: string, tx: DatabaseTransaction): Promise<void> {
    await tx.user.update({ where: { id: userId }, data: { avatarMediaId: null } });
  }

  /** Xóa PII và credential, giữ UUID User cùng mọi tham chiếu lịch sử chat/đề xuất. */
  async finish(userId: string, tx: DatabaseTransaction): Promise<void> {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    const listings = await tx.listing.findMany({
      where: { ownerId: userId },
      select: { id: true },
    });
    const listingIds = listings.map((listing) => listing.id);
    await tx.listing.updateMany({
      where: { ownerId: userId },
      data: {
        status: "DELETED",
        deletedAt: new Date(),
        title: "Bài đăng đã xóa",
        searchTitle: "bai dang da xoa",
        description: "Nội dung bài đăng đã được xóa.",
        contactPhone: null,
      },
    });
    await tx.userFollow.deleteMany({
      where: { OR: [{ followerId: userId }, { followingId: userId }] },
    });
    await tx.userBlock.deleteMany({
      where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
    });
    await tx.listingFollow.deleteMany({
      where: { OR: [{ userId }, { listingId: { in: listingIds } }] },
    });
    await tx.notification.deleteMany({ where: { recipientId: userId } });
    await tx.outboxEvent.updateMany({
      where: {
        aggregateId: { in: [userId, ...listingIds] },
        eventType: { not: deletionEventType },
      },
      data: {
        payload: {},
        lastError: null,
        status: "PROCESSED",
        processedAt: new Date(),
        lockedUntil: null,
      },
    });
    const alreadyAnonymous =
      user.status === "DELETED" &&
      user.displayName === "Tài khoản đã xóa" &&
      !user.passwordHash &&
      !user.email &&
      !user.phone;
    await tx.user.update({
      where: { id: userId },
      data: {
        username: alreadyAnonymous ? user.username : `d_${randomBytes(14).toString("hex")}`,
        displayName: "Tài khoản đã xóa",
        bio: null,
        provinceId: null,
        avatarMediaId: null,
        usernameChangedAt: null,
        status: "DELETED",
        deletionRequestedAt: null,
      },
    });
  }
}
