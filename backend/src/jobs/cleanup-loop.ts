import type { Logger } from "pino";

export class CleanupLoop {
  private timer?: NodeJS.Timeout;
  private work?: Promise<void>;

  /** Để PostgreSQL nhận quyền xử lý sự kiện, giúp nhiều tiến trình backend chạy worker an toàn. */
  constructor(
    private readonly cleanup: { runOnce(): Promise<boolean> },
    private readonly logger: Logger,
  ) {}

  /** Thăm dò theo lô giới hạn, không chồng lần lặp trước trong cùng tiến trình. */
  start(): void {
    this.timer = setInterval(() => {
      if (this.work) return;
      this.work = this.tick().finally(() => {
        this.work = undefined;
      });
    }, 5000);
    this.timer.unref();
  }

  /** Xử lý lô nhỏ; chỉ log mã lỗi cố định, không chứa payload hoặc PII. */
  private async tick(): Promise<void> {
    try {
      for (let index = 0; index < 10; index++) if (!(await this.cleanup.runOnce())) break;
    } catch {
      this.logger.error({ code: "CLEANUP_UNAVAILABLE" }, "Cleanup will retry");
    }
  }

  /** Dừng lập lịch và chờ thao tác đang chạy trước khi đóng database. */
  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.work;
  }
}
