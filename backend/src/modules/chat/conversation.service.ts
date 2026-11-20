import type { z } from "zod";
import type { Principal } from "../auth";
import type { DatabaseTransaction } from "../../shared/database/prisma";
import { AppError } from "../../shared/errors/app-error";
import type { ChatAccess } from "./chat-access";
import type { ConversationRow } from "./chat.repository";
import { conversationDto } from "./chat.dto";
import { decodeChatCursor, encodeChatCursor } from "./chat-policy";
import type { conversationInput, inboxQuery } from "./chat.schema";

export class ConversationService {
  /** Phối hợp Auth và repository Chat, giữ controller chỉ làm HTTP mapping. */
  constructor(private readonly access: ChatAccess) {}

  /** Khóa cặp User và Listing trước uniqueness lookup, an toàn trước tạo đồng thời. */
  async create(principal: Principal, input: z.infer<typeof conversationInput>) {
    const repository = this.access.repository;
    const listing = input.type === "LISTING" ? await repository.listing(input.listingId) : null;
    if (input.type === "LISTING" && !listing)
      throw new AppError(404, "NOT_FOUND", "Listing not found.");
    const peerId = input.type === "DIRECT" ? input.userId : listing!.ownerId;
    if (peerId === principal.userId) throw new AppError(403, "CHAT_SELF", "Choose another user.");
    const ids = [principal.userId, peerId].sort();
    return repository.transaction(async (tx) => {
      await repository.locks(tx, ids, listing?.id);
      await this.access.sessions.requireCurrent(principal, tx);
      const where =
        input.type === "LISTING"
          ? { listingId: input.listingId, contactUserId: principal.userId }
          : { directUserLowId: ids[0], directUserHighId: ids[1] };
      const existing = await repository.existing(where, tx);
      if (existing) return this.dto(existing, principal.userId, tx);
      const users = await repository.users(ids, tx);
      if (
        users.length !== 2 ||
        users.some((user) => user.status !== "ACTIVE") ||
        !(await repository.pairAllowed(ids, tx))
      )
        throw new AppError(403, "CHAT_NOT_ALLOWED", "Cannot create this conversation.");
      if (listing) {
        const current = await repository.listing(listing.id, tx);
        if (
          !current ||
          current.ownerId !== peerId ||
          current.status !== "ACTIVE" ||
          current.deletedAt
        )
          throw new AppError(409, "LISTING_NOT_ACTIVE", "Listing is not active.");
      }
      const row = await repository.create(
        { type: input.type, initiatorId: principal.userId, ...where },
        ids,
        tx,
      );
      return this.dto(row, principal.userId, tx);
    });
  }

  /** Chi tiết vẫn có thể mở trực tiếp khi participant đã ẩn Inbox. */
  get(principal: Principal, id: string) {
    return this.access.withConversation(principal, id, (row, tx) =>
      this.dto(row, principal.userId, tx),
    );
  }

  /** Inbox có filter phục vụ nhóm Listing→người liên hệ và nhóm DIRECT riêng. */
  async inbox(principal: Principal, query: z.infer<typeof inboxQuery>) {
    const repository = this.access.repository;
    return repository.transaction(async (tx) => {
      await repository.locks(tx, [principal.userId]);
      await this.access.sessions.requireCurrent(principal, tx);
      const scope = JSON.stringify([
        principal.userId,
        query.group ?? null,
        query.listingId ?? null,
      ]);
      const last = decodeChatCursor(query.after, scope);
      const rows = await repository.inbox(
        principal.userId,
        { type: query.group, listingId: query.listingId },
        query.limit,
        last,
        tx,
      );
      const page = rows.slice(0, query.limit);
      return {
        data: await Promise.all(page.map((row) => this.dto(row, principal.userId, tx))),
        pagination: {
          nextCursor:
            rows.length > query.limit && page.length
              ? encodeChatCursor(scope, page[page.length - 1])
              : null,
        },
      };
    });
  }

  /** Xóa mềm không đổi read state, nội dung hoặc retention. */
  async hide(principal: Principal, id: string): Promise<void> {
    await this.access.withConversation(principal, id, async (_row, tx) => {
      await this.access.repository.hide(
        id,
        principal.userId,
        await this.access.repository.now(tx),
        tx,
      );
    });
  }

  /** Tính số chưa đọc từ cursor thực thay vì counter dễ mất đồng bộ khi hide/restore. */
  private async dto(row: ConversationRow, userId: string, tx: DatabaseTransaction) {
    const participant = row.participants.find((p) => p.userId === userId);
    return conversationDto(
      row,
      userId,
      await this.access.repository.unread(row.id, userId, participant?.lastReadMessage ?? null, tx),
    );
  }
}
