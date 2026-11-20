import type { PrismaClient, Prisma } from "../../generated/prisma/client";
import type { DatabaseTransaction } from "../../shared/database/prisma";

export const notificationProjection = {
  id: true,
  type: true,
  conversationId: true,
  listingId: true,
  proposalId: true,
  latestMessageId: true,
  lastEventId: true,
  isRead: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.NotificationSelect;

export class NotificationRepository {
  /** Repository sở hữu toàn bộ truy vấn quản lý thông báo cá nhân. */
  constructor(readonly db: PrismaClient) {}

  /** Chỉ trả trang chưa xóa của caller, keyset có tie breaker UUID. */
  list(
    userId: string,
    limit: number,
    cursor: { id: string; createdAt: Date } | undefined,
    tx: DatabaseTransaction,
  ) {
    return tx.notification.findMany({
      where: {
        recipientId: userId,
        deletedAt: null,
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      select: notificationProjection,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });
  }

  /** Đếm từ dữ liệu bền vững, không dùng counter cache có thể lệch. */
  count(userId: string, tx: DatabaseTransaction) {
    return tx.notification.count({
      where: { recipientId: userId, deletedAt: null, isRead: false },
    });
  }

  /** Lookup ownership trong cùng query, không tiết lộ sự tồn tại của thông báo người khác. */
  owned(userId: string, id: string, tx: DatabaseTransaction) {
    return tx.notification.findFirst({ where: { id, recipientId: userId } });
  }

  /** Ghi trạng thái sau khi service đã giữ recipient lock và kiểm tra event boundary. */
  update(id: string, data: Prisma.NotificationUpdateInput, tx: DatabaseTransaction) {
    return tx.notification.update({ where: { id }, data });
  }

  /** Không nuốt notification đã nhận thêm sự kiện sau thời điểm UI tải danh sách. */
  readAll(userId: string, through: Date, tx: DatabaseTransaction) {
    return tx.$executeRaw`UPDATE notifications SET "isRead"=true,"readAt"=clock_timestamp()
      WHERE "recipientId"=${userId}::uuid AND "deletedAt" IS NULL AND "isRead"=false
      AND "updatedAt"<=${through}`;
  }

  /** Đích lịch sử cần membership hiện tại; không suy quyền từ notification reference. */
  target(conversationId: string, userId: string, tx: DatabaseTransaction) {
    return tx.conversation.findFirst({
      where: { id: conversationId, participants: { some: { userId } } },
      select: { id: true },
    });
  }

  /** Biên tăng đơn điệu của recipient phân biệt được cả sự kiện cùng mili giây. */
  async boundary(userId: string, tx: DatabaseTransaction): Promise<Date> {
    const row = await tx.notification.aggregate({
      where: { recipientId: userId },
      _max: { updatedAt: true },
    });
    return row._max.updatedAt ?? new Date(0);
  }
}
