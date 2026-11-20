export type NotificationChange = { recipientId: string; notificationId: string | null };

export class NotificationEvents {
  private readonly listeners = new Set<(change: NotificationChange) => Promise<void>>();

  /** Composition root đăng ký transport mà không đưa Socket.IO vào nghiệp vụ. */
  subscribe(listener: (change: NotificationChange) => Promise<void>): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Chỉ phát sau commit; lỗi transport không đổi kết quả persistence. */
  async changed(change: NotificationChange): Promise<void> {
    await Promise.allSettled([...this.listeners].map((listener) => listener(change)));
  }
}
