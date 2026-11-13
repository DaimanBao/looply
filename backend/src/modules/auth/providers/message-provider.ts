import { unavailable } from "../auth.errors";
import type { MessageProvider } from "../auth.types";

export class FakeMessageProvider implements MessageProvider {
  private readonly deliveries = new Map<string, { code: string; expiresAt: number }>();

  /** Chỉ giữ bản gửi local/test, không đưa mã vào HTTP response hoặc log. */
  async send(destination: string, code: string): Promise<void> {
    for (const [key, delivery] of this.deliveries)
      if (delivery.expiresAt <= Date.now()) this.deliveries.delete(key);
    if (this.deliveries.size >= 1000) this.deliveries.clear();
    const delivery = { code, expiresAt: Date.now() + 300000 };
    this.deliveries.set(destination, delivery);
    // Xóa bản rõ cả khi tiến trình rảnh; timer cũ không được xóa bản gửi thay thế.
    setTimeout(() => {
      if (this.deliveries.get(destination) === delivery) this.deliveries.delete(destination);
    }, 300000).unref();
  }

  /** Chỉ cung cấp bản gửi mới nhất cho fixture test cùng tiến trình; không HTTP route nào truy cập hàm này. */
  lastCode(destination: string): string | undefined {
    const delivery = this.deliveries.get(destination);
    return delivery && delivery.expiresAt > Date.now() ? delivery.code : undefined;
  }
}
export class HttpMessageProvider implements MessageProvider {
  /** Dùng adapter gateway HTTPS được cấu hình tường minh, riêng cho SMS và email. */
  constructor(
    private readonly url: string,
    private readonly key: string,
    private readonly request: typeof fetch = fetch,
  ) {}

  /** Gửi yêu cầu có xác thực và giới hạn; lỗi gateway không tiết lộ mã hoặc response provider. */
  async send(destination: string, code: string): Promise<void> {
    try {
      const response = await this.request(this.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.key}` },
        body: JSON.stringify({ destination, code, expiresIn: 300 }),
        signal: AbortSignal.timeout(5000),
        redirect: "error",
      });
      if (!response.ok) throw unavailable();
    } catch {
      throw unavailable();
    }
  }
}
