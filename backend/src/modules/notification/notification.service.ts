import type { Principal, SessionService } from "../auth";
import type { DatabaseTransaction } from "../../shared/database/prisma";
import { lockResources } from "../../shared/database/locks";
import { AppError } from "../../shared/errors/app-error";
import type { NotificationEvents } from "./notification.events";
import type { NotificationRepository } from "./notification.repository";
import { decodeCursor, encodeCursor } from "./notification.schema";

export class NotificationService {
  /** Session và recipient lock dùng chung cho đọc, mutation và consumer. */
  constructor(
    private readonly repository: NotificationRepository,
    private readonly sessions: SessionService,
    private readonly events: NotificationEvents,
  ) {}

  /** Khóa User trước Notification và kiểm tra lại phiên bên trong transaction. */
  private authorized<T>(
    principal: Principal,
    run: (tx: DatabaseTransaction) => Promise<T>,
  ): Promise<T> {
    return this.repository.db.$transaction(async (tx) => {
      await lockResources(tx, [`user:${principal.userId}`]);
      await this.sessions.requireCurrent(principal, tx);
      await lockResources(tx, [`notification:${principal.userId}`]);
      return run(tx);
    });
  }

  /** Không thay đổi isRead khi tải danh sách. */
  list(principal: Principal, query: { limit: number; after?: string }) {
    return this.authorized(principal, async (tx) => {
      const cursor = decodeCursor(query.after, principal.userId);
      const rows = await this.repository.list(principal.userId, query.limit, cursor, tx);
      const data = rows.slice(0, query.limit);
      return {
        data,
        pagination: {
          nextCursor:
            rows.length > query.limit
              ? encodeCursor(data[data.length - 1], principal.userId)
              : null,
        },
        asOf: (await this.repository.boundary(principal.userId, tx)).toISOString(),
      };
    });
  }

  /** Badge chỉ đếm notification chưa đọc/chưa xóa thuộc tài khoản hiện hành. */
  count(principal: Principal) {
    return this.authorized(principal, async (tx) => ({
      count: await this.repository.count(principal.userId, tx),
    }));
  }

  /** Compare event ID bảo vệ tin mới được gộp trong khi người dùng đang nhấn đọc. */
  async read(principal: Principal, id: string, expectedEventId: string | null): Promise<void> {
    await this.authorized(principal, async (tx) => {
      const row = await this.repository.owned(principal.userId, id, tx);
      if (!row || row.deletedAt) throw new AppError(404, "NOT_FOUND", "Notification not found.");
      if (row.lastEventId !== expectedEventId)
        throw new AppError(
          409,
          "NOTIFICATION_CHANGED",
          "New activity arrived. Reload notifications.",
        );
      if (!row.isRead)
        await this.repository.update(
          id,
          { isRead: true, readAt: new Date(), updatedAt: row.updatedAt },
          tx,
        );
    });
    await this.events.changed({ recipientId: principal.userId, notificationId: null });
  }

  /** Ranh giới do server cấp, không đánh dấu sự kiện phát sinh sau trang đã xem. */
  async readAll(principal: Principal, through: Date): Promise<void> {
    await this.authorized(principal, async (tx) => {
      const boundary = await this.repository.boundary(principal.userId, tx);
      if (through > boundary) throw new AppError(400, "VALIDATION_ERROR", "Invalid read boundary.");
      await this.repository.readAll(principal.userId, through, tx);
    });
    await this.events.changed({ recipientId: principal.userId, notificationId: null });
  }

  /** Soft delete idempotent không đụng Message/Proposal hoặc biên nhận outbox. */
  async remove(principal: Principal, id: string): Promise<void> {
    await this.authorized(principal, async (tx) => {
      const row = await this.repository.owned(principal.userId, id, tx);
      if (!row) throw new AppError(404, "NOT_FOUND", "Notification not found.");
      if (!row.deletedAt)
        await this.repository.update(id, { deletedAt: new Date(), updatedAt: row.updatedAt }, tx);
    });
    await this.events.changed({ recipientId: principal.userId, notificationId: null });
  }

  /** Kiểm tra lại đích trước điều hướng; API Chat tiếp tục phân quyền khi tải nội dung. */
  target(principal: Principal, id: string) {
    return this.authorized(principal, async (tx) => {
      const row = await this.repository.owned(principal.userId, id, tx);
      if (
        !row ||
        row.deletedAt ||
        !row.conversationId ||
        !(await this.repository.target(row.conversationId, principal.userId, tx))
      )
        throw new AppError(404, "NOT_FOUND", "Notification target is unavailable.");
      return { conversationId: row.conversationId, messageId: row.latestMessageId };
    });
  }
}
