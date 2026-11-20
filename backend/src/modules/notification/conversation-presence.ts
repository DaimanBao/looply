export class ConversationPresence {
  private readonly entries = new Map<
    string,
    {
      userId: string;
      conversationId: string;
      expiresAt: number;
      authorized?: () => Promise<boolean>;
    }
  >();

  /** Chỉ gateway đã xác thực và kiểm tra participant được ghi heartbeat. */
  view(
    socketId: string,
    userId: string,
    conversationId: string,
    viewing: boolean,
    authorized?: () => Promise<boolean>,
  ): void {
    if (!viewing) {
      const entry = this.entries.get(socketId);
      if (entry?.conversationId === conversationId) this.entries.delete(socketId);
      return;
    }
    this.entries.set(socketId, {
      userId,
      conversationId,
      expiresAt: Date.now() + 35000,
      authorized,
    });
  }

  /** Thu hồi ngay khi socket đóng, không chờ TTL. */
  leave(socketId: string): void {
    this.entries.delete(socketId);
  }

  /** Một tab còn lease hợp lệ là đủ; đồng thời loại heartbeat đã hết hạn. */
  async isViewing(userId: string, conversationId: string): Promise<boolean> {
    let found = false;
    for (const [socketId, entry] of this.entries) {
      if (entry.expiresAt <= Date.now()) this.entries.delete(socketId);
      else if (entry.userId === userId && entry.conversationId === conversationId) {
        try {
          const authorized = !entry.authorized || (await entry.authorized());
          const current = this.entries.get(socketId);
          if (
            authorized &&
            current?.userId === userId &&
            current.conversationId === conversationId &&
            current.expiresAt > Date.now()
          )
            found = true;
          else if (!authorized && current === entry) this.entries.delete(socketId);
        } catch {
          if (this.entries.get(socketId) === entry) this.entries.delete(socketId);
        }
      }
    }
    return found;
  }
}
