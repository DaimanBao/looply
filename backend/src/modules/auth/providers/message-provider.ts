import { unavailable } from "../auth.errors";
import type { MessageProvider } from "../auth.types";

export class FakeMessageProvider implements MessageProvider {
  private readonly deliveries = new Map<string, { code: string; expiresAt: number }>();
  /** Captures only local/test deliveries, never emits codes to HTTP responses or logs. */
  async send(destination: string, code: string): Promise<void> {
    for (const [key, delivery] of this.deliveries) if (delivery.expiresAt <= Date.now()) this.deliveries.delete(key);
    if (this.deliveries.size >= 1000) this.deliveries.clear();
    this.deliveries.set(destination, { code, expiresAt: Date.now() + 300000 });
  }
  /** Exposes the latest delivery only to in-process test fixtures; no HTTP route accesses this method. */
  lastCode(destination: string): string | undefined {
    const delivery = this.deliveries.get(destination);
    return delivery && delivery.expiresAt > Date.now() ? delivery.code : undefined;
  }
}
export class HttpMessageProvider implements MessageProvider {
  /** Targets an explicitly configured HTTPS gateway adapter, independently for SMS and email. */
  constructor(private readonly url: string, private readonly key: string, private readonly request: typeof fetch = fetch) {}
  /** Uses a bounded authenticated request; gateway failures never expose a code or provider response. */
  async send(destination: string, code: string): Promise<void> {
    try {
      const response = await this.request(this.url, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.key}` }, body: JSON.stringify({ destination, code, expiresIn: 300 }), signal: AbortSignal.timeout(5000), redirect: "error" });
      if (!response.ok) throw unavailable();
    } catch { throw unavailable(); }
  }
}
