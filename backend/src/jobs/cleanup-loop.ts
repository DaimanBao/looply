import type { Logger } from "pino";

export class CleanupLoop {
  private timer?: NodeJS.Timeout;
  private work?: Promise<void>;
  /** Leaves event claims to PostgreSQL so multiple backend processes can safely run workers. */
  constructor(private readonly cleanup: { runOnce(): Promise<boolean> }, private readonly logger: Logger) {}
  /** Polls in bounded batches without overlapping a previous iteration in this process. */
  start(): void {
    this.timer = setInterval(() => {
      if (this.work) return;
      this.work = this.tick().finally(() => { this.work = undefined; });
    }, 5000);
    this.timer.unref();
  }
  /** Processes a small batch; failures are logged only as fixed codes, without payloads or PII. */
  private async tick(): Promise<void> {
    try { for (let index = 0; index < 10; index++) if (!await this.cleanup.runOnce()) break; }
    catch { this.logger.error({ code: "CLEANUP_UNAVAILABLE" }, "Cleanup will retry"); }
  }
  /** Stops scheduling and waits for the in-flight operation before the database closes. */
  async stop(): Promise<void> { if (this.timer) clearInterval(this.timer); await this.work; }
}
