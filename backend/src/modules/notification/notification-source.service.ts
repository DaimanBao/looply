import { z } from "zod";
import type { DatabaseTransaction } from "../../shared/database/prisma";
import type {
  NotificationOutboxRepository,
  NotificationEvent,
  NotificationIntent,
} from "./notification-outbox.repository";

const messagePayload = z.object({
  messageId: z.uuid(),
  suppressNotification: z.boolean().optional(),
});
const proposalPayload = z.object({
  proposalId: z.uuid(),
  status: z.enum(["ACCEPTED", "REJECTED"]),
});
const listingPayload = z.object({
  listingId: z.uuid(),
  version: z.number().int().positive(),
  conversationIds: z.array(z.uuid()).optional(),
});

export class NotificationSourceService {
  /** Quy tắc chọn recipient/type thuộc Notification, repository chỉ cung cấp dữ liệu nguồn. */
  constructor(private readonly repository: NotificationOutboxRepository) {}

  /** Đối chiếu identifier với dữ liệu thật; không nhận recipient do payload khai báo làm quyền. */
  async intents(event: NotificationEvent, tx: DatabaseTransaction): Promise<NotificationIntent[]> {
    if (event.eventType === "listing.updated") return this.listing(event, tx);
    if (event.eventType === "chat.message.created") return this.message(event, tx);
    return this.proposal(event, tx);
  }

  /** Chỉ contact có Conversation tại thời điểm edit được nhận; không thông báo follower/owner. */
  private async listing(
    event: NotificationEvent,
    tx: DatabaseTransaction,
  ): Promise<NotificationIntent[]> {
    const payload = listingPayload.parse(event.payload);
    if (payload.listingId !== event.aggregateId) throw new Error("Invalid listing event");
    const listing = await this.repository.listing(payload.listingId, tx);
    if (!listing) return [];
    const conversations = await this.repository.conversations(
      listing.id,
      event.createdAt,
      tx,
      payload.conversationIds,
    );
    return conversations.flatMap((row) =>
      row.participants
        .filter((p) => p.userId !== listing.ownerId)
        .map((p) => ({
          recipientId: p.userId,
          actorId: listing.ownerId,
          conversationId: row.id,
          listingId: listing.id,
          proposalId: null,
          messageId: null,
          type: "LISTING_UPDATED" as const,
          eventKey: `listing:${listing.id}:${payload.version}:${row.id}`,
        })),
    );
  }

  /** Presence chỉ chặn tin nhắn thường, không chặn thông báo card giao dịch. */
  private async message(
    event: NotificationEvent,
    tx: DatabaseTransaction,
  ): Promise<NotificationIntent[]> {
    const payload = messagePayload.parse(event.payload);
    const message = await this.repository.message(payload.messageId, tx);
    if (!message || message.conversationId !== event.aggregateId) return [];
    if (message.type === "TEXT" && payload.suppressNotification) return [];
    return message.conversation.participants
      .filter((p) => p.userId !== message.senderId)
      .map((p) => ({
        recipientId: p.userId,
        actorId: message.senderId,
        conversationId: message.conversationId,
        listingId: message.conversation.listingId,
        proposalId: message.proposalId,
        messageId: message.id,
        type: message.type === "TRANSACTION_CARD" ? "TRANSACTION" : "MESSAGE",
        eventKey:
          message.type === "TRANSACTION_CARD" ? `proposal:${message.proposalId}:created` : null,
      }));
  }

  /** Kết quả chỉ gửi proposer, event/status phải khớp chuyển trạng thái đã commit. */
  private async proposal(
    event: NotificationEvent,
    tx: DatabaseTransaction,
  ): Promise<NotificationIntent[]> {
    const payload = proposalPayload.parse(event.payload);
    const proposal = await this.repository.proposal(payload.proposalId, tx);
    if (
      !proposal ||
      proposal.conversationId !== event.aggregateId ||
      proposal.status !== payload.status
    )
      return [];
    return [
      {
        recipientId: proposal.proposerId,
        actorId: proposal.listing.ownerId,
        conversationId: proposal.conversationId,
        listingId: proposal.listingId,
        proposalId: proposal.id,
        messageId: proposal.card?.id ?? null,
        type: "TRANSACTION",
        eventKey: `proposal:${proposal.id}:${payload.status}`,
      },
    ];
  }
}
