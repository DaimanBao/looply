import { z } from "zod";
import type { PrismaClient } from "../generated/prisma/client";
import type { DatabaseTransaction } from "../shared/database/prisma";

const eventSchema = z.object({
  id: z.uuid(),
  aggregateId: z.uuid(),
  eventType: z.enum(["account.delete", "media.cleanup"]),
  payload: z.unknown(),
  attempts: z.number().int(),
});
export type CleanupEvent = z.infer<typeof eventSchema>;
export class CleanupRepository {
  /** Tái sử dụng các trường lease/retry và biên nhận sự kiện của outbox hiện có. */
  constructor(private readonly db: PrismaClient) {}

  /** Nhận tối đa một sự kiện đến hạn, kể cả từ worker lỗi đã hết lease. */
  async claim(): Promise<CleanupEvent | null> {
    const rows = await this.db.$queryRaw<unknown[]>`
      UPDATE outbox_events SET status='PROCESSING', attempts=attempts+1, "lockedUntil"=NOW()+INTERVAL '2 minutes'
      WHERE id IN (SELECT id FROM outbox_events WHERE "eventType" IN ('account.delete','media.cleanup')
        AND ((status IN ('PENDING','FAILED') AND ("nextRetryAt" IS NULL OR "nextRetryAt"<=NOW()))
          OR (status='PROCESSING' AND "lockedUntil"<NOW())) ORDER BY "createdAt" FOR UPDATE SKIP LOCKED LIMIT 1)
      RETURNING id,"aggregateId","eventType",payload,attempts`;
    return rows.length ? eventSchema.parse(rows[0]) : null;
  }

  /** Ghi hoàn tất và biên nhận nguyên tử; chủ lease cũ không thể xác nhận lượt nhận mới hơn. */
  async complete(event: CleanupEvent): Promise<void> {
    await this.db.$transaction(async (tx) => {
      const done = await tx.outboxEvent.updateMany({
        where: { id: event.id, attempts: event.attempts, status: "PROCESSING" },
        data: { status: "PROCESSED", processedAt: new Date(), lockedUntil: null, lastError: null },
      });
      if (done.count)
        await tx.processedEvent.upsert({
          where: {
            consumerName_eventId: { consumerName: "account-media-cleanup", eventId: event.id },
          },
          create: { consumerName: "account-media-cleanup", eventId: event.id },
          update: {},
        });
    });
  }

  /** Chặn job đã hủy và chủ lease bị thay thế trước mọi chuyển trạng thái User không thể đảo ngược. */
  async current(event: CleanupEvent, tx: DatabaseTransaction): Promise<boolean> {
    return !!(await tx.outboxEvent.findFirst({
      where: { id: event.id, status: "PROCESSING", attempts: event.attempts },
      select: { id: true },
    }));
  }

  /** Thử lại với backoff giới hạn và mã lỗi an toàn cố định, không chứa storage key hay nội dung exception. */
  async fail(event: CleanupEvent): Promise<void> {
    await this.db.outboxEvent.updateMany({
      where: { id: event.id, attempts: event.attempts, status: "PROCESSING" },
      data: {
        status: "FAILED",
        lockedUntil: null,
        nextRetryAt: new Date(
          Date.now() + Math.min(3600, 2 ** Math.min(event.attempts, 12)) * 1000,
        ),
        lastError: "CLEANUP_RETRY",
      },
    });
  }
}
