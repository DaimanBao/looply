export class ChatEvents {
  private readonly listeners = new Set<(conversationId: string) => Promise<void>>();

  /** Đăng ký adapter realtime tại composition root, không phụ thuộc Socket.IO trong domain. */
  subscribe(listener: (conversationId: string) => Promise<void>): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Chỉ gọi sau commit; lỗi kết nối realtime không biến một mutation đã commit thành lỗi HTTP. */
  async changed(conversationId: string): Promise<void> {
    await Promise.allSettled([...this.listeners].map((listener) => listener(conversationId)));
  }
}
