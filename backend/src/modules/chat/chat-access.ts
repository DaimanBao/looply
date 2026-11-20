import type { Principal, SessionService } from "../auth";
import type { DatabaseTransaction } from "../../shared/database/prisma";
import { AppError } from "../../shared/errors/app-error";
import type { ChatRepository, ConversationRow } from "./chat.repository";

export class ChatAccess {
  /** Dùng chung cổng quyền cho REST, socket, proposal và media delivery. */
  constructor(
    readonly repository: ChatRepository,
    readonly sessions: SessionService,
  ) {}

  /** Kiểm tra membership cả trước và sau khóa; lịch sử vẫn đọc được khi đối tác Block/inactive. */
  async withConversation<T>(
    principal: Principal,
    id: string,
    run: (row: ConversationRow, tx: DatabaseTransaction) => Promise<T>,
  ): Promise<T> {
    const candidate = await this.repository.conversation(id);
    if (!candidate || !candidate.participants.some((p) => p.userId === principal.userId))
      throw new AppError(404, "NOT_FOUND", "Conversation not found.");
    return this.repository.transaction(async (tx) => {
      await this.repository.locks(
        tx,
        candidate.participants.map((p) => p.userId),
        candidate.listingId,
        id,
      );
      await this.sessions.requireCurrent(principal, tx);
      const row = await this.repository.conversation(id, tx);
      if (!row || !row.participants.some((p) => p.userId === principal.userId))
        throw new AppError(404, "NOT_FOUND", "Conversation not found.");
      return run(row, tx);
    });
  }

  /** Chỉ nội dung mới cần cả hai User ACTIVE và không bị chặn ở một trong hai chiều. */
  async writable(row: ConversationRow, tx: DatabaseTransaction): Promise<void> {
    if (
      row.participants.length !== 2 ||
      row.participants.some((p) => p.user.status !== "ACTIVE") ||
      !(await this.repository.pairAllowed(
        row.participants.map((p) => p.userId),
        tx,
      ))
    )
      throw new AppError(
        403,
        "CHAT_NOT_ALLOWED",
        "Messaging is not available for these participants.",
      );
  }
}
