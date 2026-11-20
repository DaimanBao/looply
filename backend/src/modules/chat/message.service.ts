import type { Principal } from "../auth";
import type { ChatMediaService } from "../media";
import { AppError } from "../../shared/errors/app-error";
import type { ChatAccess } from "./chat-access";
import type { ChatEvents } from "./chat-events";
import type { ChatRetention } from "./chat-retention.service";
import type { ChatPage, MessageInput } from "./chat.schema";
import { decodeChatCursor, encodeChatCursor, isAfter, payloadHash } from "./chat-policy";
import { messageDto } from "./chat.dto";

export class MessageService {
  /** Dùng chung application service cho REST/socket; Media xử lý bytes và vòng đời asset. */
  constructor(
    private readonly access: ChatAccess,
    private readonly media: ChatMediaService,
    private readonly retention: ChatRetention,
    private readonly events: ChatEvents,
    private readonly isViewing: (
      userId: string,
      conversationId: string,
    ) => boolean | Promise<boolean> = () => false,
  ) {}

  /** Lưu nội dung đúng một lần; replay không unhide, không tăng activity hoặc phát sự kiện mới. */
  async send(principal: Principal, id: string, input: MessageInput) {
    let created = false;
    const result = await this.access.withConversation(principal, id, async (row, tx) => {
      const repository = this.access.repository;
      const hash = payloadHash(["TEXT", input.content ?? null, input.imageMediaId ?? null]);
      const old = await repository.replay(id, principal.userId, input.requestId, tx);
      if (old) {
        if (old.payloadHash !== hash)
          throw new AppError(409, "REQUEST_CONFLICT", "Use a new requestId for different content.");
        return messageDto(old, row, await repository.now(tx));
      }
      await this.access.writable(row, tx);
      if (input.imageMediaId) await this.media.attach(input.imageMediaId, principal.userId, id, tx);
      const now = await repository.now(tx);
      await this.retention.retire(row, now, tx);
      const message = await repository.insertMessage(
        {
          conversationId: id,
          senderId: principal.userId,
          requestId: input.requestId,
          type: "TEXT",
          content: input.content ?? null,
          imageMediaId: input.imageMediaId ?? null,
          payloadHash: hash,
          createdAt: now,
        },
        tx,
      );
      await repository.activity(
        id,
        new Date(Math.max(now.getTime(), row.lastActivityAt.getTime())),
        true,
        tx,
      );
      await repository.restore(id, tx);
      await repository.event(
        id,
        "chat.message.created",
        {
          conversationId: id,
          messageId: message.id,
          senderId: principal.userId,
          recipientId: row.participants.find((p) => p.userId !== principal.userId)!.userId,
          suppressNotification: await this.isViewing(
            row.participants.find((p) => p.userId !== principal.userId)!.userId,
            id,
          ),
        },
        tx,
      );
      created = true;
      return messageDto(message, row, now);
    });
    if (created) await this.events.changed(id);
    return result;
  }

  /** Chỉ tải một trang đã phân quyền; cursor không thay thế membership. */
  history(principal: Principal, id: string, query: ChatPage) {
    return this.access.withConversation(principal, id, async (row, tx) => {
      const scope = JSON.stringify([principal.userId, id]);
      const rows = await this.access.repository.messages(
        id,
        query.limit,
        decodeChatCursor(query.after, scope),
        tx,
      );
      const page = rows.slice(0, query.limit);
      const now = await this.access.repository.now(tx);
      return {
        data: page.map((message) => messageDto(message, row, now)),
        pagination: {
          nextCursor:
            rows.length > query.limit && page.length
              ? encodeChatCursor(scope, page[page.length - 1])
              : null,
        },
      };
    });
  }

  /** Cursor tăng đơn điệu; đọc bao hàm nhận, không chấp nhận Message khác Conversation. */
  async receipt(principal: Principal, id: string, messageId: string, read: boolean): Promise<void> {
    let changed = false;
    await this.access.withConversation(principal, id, async (row, tx) => {
      const repository = this.access.repository;
      const message = await repository.message(messageId, tx);
      if (!message || message.conversationId !== id)
        throw new AppError(404, "NOT_FOUND", "Message not found.");
      const participant = row.participants.find((p) => p.userId === principal.userId)!;
      const data: { lastReadMessageId?: string; lastDeliveredMessageId?: string } = {};
      if (!participant.lastDeliveredMessage || isAfter(message, participant.lastDeliveredMessage))
        data.lastDeliveredMessageId = message.id;
      if (read && (!participant.lastReadMessage || isAfter(message, participant.lastReadMessage)))
        data.lastReadMessageId = message.id;
      if (Object.keys(data).length) {
        await repository.receipt(id, principal.userId, data, tx);
        changed = true;
      }
    });
    if (changed) await this.events.changed(id);
  }

  /** Validate trước xử lý nặng và trước trả ID; thất bại có reservation cho worker cleanup. */
  async upload(principal: Principal, id: string, input: Buffer) {
    await this.access.withConversation(principal, id, (row, tx) => this.access.writable(row, tx));
    const images = await this.media.optimize(input);
    const asset = await this.access.withConversation(principal, id, async (row, tx) => {
      await this.access.writable(row, tx);
      return this.media.reserve(
        principal.userId,
        id,
        images.detail.length,
        await this.access.repository.now(tx),
        tx,
      );
    });
    try {
      await this.media.write(asset.id, images.detail, principal.userId);
      await this.access.withConversation(principal, id, async (row, tx) => {
        await this.access.writable(row, tx);
        await this.media.ready(asset.id, principal.userId, tx);
      });
      return { id: asset.id, expiresAt: asset.expiresAt };
    } catch (error) {
      await this.media.abandon(asset.id, principal.userId);
      throw error instanceof AppError
        ? error
        : new AppError(503, "MEDIA_UNAVAILABLE", "Image upload failed.");
    }
  }

  /** Hủy chỉ TEMP của đúng Conversation, không cho xóa ảnh đã gửi. */
  async cancel(principal: Principal, id: string, mediaId: string): Promise<void> {
    await this.access.withConversation(principal, id, (_row, tx) =>
      this.media.cancel(mediaId, principal.userId, id, tx),
    );
  }

  /** Đọc lại phiên sau storage trước khi trả byte; Block không xóa quyền xem lịch sử. */
  image(principal: Principal, id: string, messageId: string) {
    return this.access.withConversation(principal, id, async (_row, tx) => {
      const message = await this.access.repository.message(messageId, tx);
      if (!message || message.conversationId !== id || !message.imageMediaId)
        throw new AppError(404, "NOT_FOUND", "Image not found.");
      const bytes = await this.media.readAsset(message.imageMediaId, id, tx);
      await this.access.sessions.requireCurrent(principal, tx);
      return bytes;
    });
  }
}
