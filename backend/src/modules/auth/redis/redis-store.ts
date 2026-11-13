import { createClient } from "redis";
import { unavailable } from "../auth.errors";

export interface ScriptStore {
  eval(script: string, keys: string[], arguments_: string[]): Promise<unknown>;
}
export class RedisStore implements ScriptStore {
  private readonly client;
  private readonly database: number;

  /** Giữ credential và chẩn đoán kết nối lại ngoài lỗi công khai và log. */
  constructor(url: string) {
    this.database = Number(new URL(url).pathname.slice(1) || "0");
    this.client = createClient({
      url,
      disableOfflineQueue: true,
      socket: { connectTimeout: 5000, reconnectStrategy: false },
    });
    this.client.on("error", () => {
      /* Operations fail closed below; never log connection credentials. */
    });
  }

  /** Kết nối tường minh khi khởi động, không tạo tác dụng phụ khi import module. */
  async connect(): Promise<void> {
    try {
      await this.client.connect();
      const info = await this.client.sendCommand(["CLIENT", "INFO"]);
      if (typeof info !== "string" || !new RegExp(`(?:^| )db=${this.database}(?: |$)`).test(info)) {
        this.client.destroy();
        throw unavailable();
      }
    } catch {
      throw unavailable();
    }
  }

  /** Thực thi nguyên tử Lua của ứng dụng trên các khóa; sự cố luôn từ chối công việc xác thực. */
  async eval(script: string, keys: string[], arguments_: string[]): Promise<unknown> {
    if (!this.client.isReady) throw unavailable();
    try {
      return await this.client.eval(script, { keys, arguments: arguments_ });
    } catch {
      throw unavailable();
    }
  }

  /** Đóng client một lần; Redis đã ngắt không được trì hoãn shutdown. */
  async close(): Promise<void> {
    if (this.client.isOpen) this.client.destroy();
  }
}
