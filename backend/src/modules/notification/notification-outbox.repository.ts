import { z } from "zod";
import type { PrismaClient, Prisma } from "../../generated/prisma/client";
import type { DatabaseTransaction } from "../../shared/database/prisma";
import { visibleUserWhere } from "../user";

const claimedEvent = z.object({
  id: z.uuid(),
  eventType: z.enum(["chat.message.created", "chat.proposal.resolved", "listing.updated"]),
  aggregateId: z.uuid(),
  payload: z.unknown(),
  attempts: z.number().int(),
  createdAt: z.date(),
});
export type NotificationEvent = z.infer<typeof claimedEvent>;
export type NotificationIntent = {
  recipientId: string;
  actorId: string;
  conversationId: string;
  listingId: string | null;
  proposalId: string | null;
  messageId: string | null;
  type: "MESSAGE" | "TRANSACTION" | "LISTING_UPDATED";
  eventKey: string | null;
};

export class NotificationOutboxRepository {
  /** Chỉ sở hữu ba loại sự kiện Notification, không tranh job account/media/retention. */
  constructor(readonly db: PrismaClient) {}

  /** SKIP LOCKED và attempts cấp lease độc lập, worker chết được nhận lại sau timeout. */
  async claim(): Promise<NotificationEvent | null> {
    const rows = await this.db.$queryRaw<unknown[]>`
      UPDATE outbox_events SET status='PROCESSING',attempts=attempts+1,"lockedUntil"=NOW()+INTERVAL '2 minutes'
      WHERE id IN (SELECT id FROM outbox_events
        WHERE "eventType" IN ('chat.message.created','chat.proposal.resolved','listing.updated')
        AND ((status IN ('PENDING','FAILED') AND ("nextRetryAt" IS NULL OR "nextRetryAt"<=NOW()))
          OR (status='PROCESSING' AND "lockedUntil"<NOW()))
        ORDER BY "createdAt",id FOR UPDATE SKIP LOCKED LIMIT 1)
      RETURNING id,"eventType","aggregateId",payload,attempts,"createdAt"`;
    return rows.length ? claimedEvent.parse(rows[0]) : null;
  }

  /** Tra chủ Listing cho event edit, không đọc profile hoặc nội dung bài đăng. */
  listing(id: string, tx: DatabaseTransaction) {
    return tx.listing.findUnique({ where: { id }, select: { id: true, ownerId: true } });
  }

  /** Chọn Conversation tồn tại trước event để service xác định recipient. */
  conversations(listingId: string, through: Date, tx: DatabaseTransaction, ids?: string[]) {
    return tx.conversation.findMany({
      where: { listingId, ...(ids ? { id: { in: ids } } : { createdAt: { lte: through } }) },
      include: { participants: true },
    });
  }

  /** Chỉ lấy reference Message; consumer không cần nội dung tin nhắn hoặc ảnh. */
  message(id: string, tx: DatabaseTransaction) {
    return tx.message.findUnique({
      where: { id },
      select: {
        id: true,
        type: true,
        senderId: true,
        conversationId: true,
        proposalId: true,
        conversation: { select: { listingId: true, participants: { select: { userId: true } } } },
      },
    });
  }

  /** Lấy actor/recipient/card từ quan hệ Proposal đã commit. */
  proposal(id: string, tx: DatabaseTransaction) {
    return tx.transactionProposal.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        proposerId: true,
        conversationId: true,
        listingId: true,
        listing: { select: { ownerId: true } },
        card: { select: { id: true } },
      },
    });
  }

  /** Khớp cùng predicate User công khai của Chat, kèm membership người nhận hiện tại. */
  async allowed(intent: NotificationIntent, tx: DatabaseTransaction): Promise<boolean> {
    if (intent.actorId === intent.recipientId) return false;
    const users = await tx.user.count({
      where: {
        AND: [
          { id: { in: [intent.recipientId, intent.actorId] } },
          visibleUserWhere(intent.recipientId),
        ],
      },
    });
    return (
      users === 2 &&
      !!(await tx.conversationParticipant.findUnique({
        where: {
          conversationId_userId: {
            conversationId: intent.conversationId,
            userId: intent.recipientId,
          },
        },
      }))
    );
  }

  /** Một unread MESSAGE theo constraint; event cũ không kéo lùi latest hoặc làm hồi sinh hàng đã xóa. */
  async persist(
    intent: NotificationIntent,
    event: NotificationEvent,
    tx: DatabaseTransaction,
  ): Promise<string | null> {
    const clock = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
    const previous = await tx.notification.aggregate({
      where: { recipientId: intent.recipientId },
      _max: { updatedAt: true },
    });
    // Recipient lock và +1 ms tạo event boundary riêng cho cả burst trong một mili giây.
    const now = new Date(
      Math.max(clock[0].now.getTime(), (previous._max.updatedAt?.getTime() ?? 0) + 1),
    );
    if (
      intent.eventKey &&
      (await tx.notification.findFirst({
        where: { recipientId: intent.recipientId, eventKey: intent.eventKey },
      }))
    )
      return null;
    if (intent.type === "MESSAGE") {
      const existing = await tx.notification.findFirst({
        where: {
          recipientId: intent.recipientId,
          conversationId: intent.conversationId,
          type: "MESSAGE",
          isRead: false,
          deletedAt: null,
        },
        include: { latestMessage: { select: { id: true, createdAt: true } } },
      });
      const message = await tx.message.findUniqueOrThrow({
        where: { id: intent.messageId! },
        select: { createdAt: true, id: true },
      });
      // Hàng đã đọc/xóa cũng là watermark cho sự kiện cũ đến sau, độc lập read cursor Chat.
      const boundary = await tx.notification.findFirst({
        where: {
          recipientId: intent.recipientId,
          conversationId: intent.conversationId,
          type: "MESSAGE",
          latestMessage: {
            OR: [
              { createdAt: { gt: message.createdAt } },
              { createdAt: message.createdAt, id: { gte: message.id } },
            ],
          },
        },
        select: { id: true },
      });
      if (boundary) return null;
      if (existing) {
        await tx.notification.update({
          where: { id: existing.id },
          data: { latestMessageId: intent.messageId, lastEventId: event.id, updatedAt: now },
        });
        return existing.id;
      }
    }
    const data: Prisma.NotificationUncheckedCreateInput = {
      recipientId: intent.recipientId,
      type: intent.type,
      conversationId: intent.conversationId,
      listingId: intent.listingId,
      proposalId: intent.proposalId,
      eventKey: intent.eventKey,
      latestMessageId: intent.messageId,
      lastEventId: event.id,
      createdAt: now,
      updatedAt: now,
    };
    return (await tx.notification.create({ data })).id;
  }

  /** Biên nhận và hoàn tất outbox cùng transaction Notification; fencing thất bại buộc rollback. */
  async complete(event: NotificationEvent, tx: DatabaseTransaction): Promise<void> {
    const done = await tx.outboxEvent.updateMany({
      where: { id: event.id, status: "PROCESSING", attempts: event.attempts },
      data: { status: "PROCESSED", processedAt: new Date(), lockedUntil: null, lastError: null },
    });
    if (done.count !== 1) throw new Error("Notification lease superseded");
    await tx.processedEvent.upsert({
      where: { consumerName_eventId: { consumerName: "notification", eventId: event.id } },
      create: { consumerName: "notification", eventId: event.id },
      update: {},
    });
  }

  /** Retry bền vững không log payload, credentials hoặc exception từ database. */
  async fail(event: NotificationEvent): Promise<void> {
    await this.db.outboxEvent.updateMany({
      where: { id: event.id, status: "PROCESSING", attempts: event.attempts },
      data: {
        status: "FAILED",
        lockedUntil: null,
        lastError: "NOTIFICATION_RETRY",
        nextRetryAt: new Date(
          Date.now() + Math.min(3600, 2 ** Math.min(12, event.attempts)) * 1000,
        ),
      },
    });
  }
}
