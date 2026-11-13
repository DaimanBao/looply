import type { DatabaseTransaction } from "../../shared/database/prisma";

/** Đưa vào hàng đợi một lần dưới khóa User của bên gọi, dùng chung lease và chính sách retry outbox. */
export async function queueMediaCleanup(
  userId: string,
  mediaId: string,
  tx: DatabaseTransaction,
): Promise<void> {
  const existing = await tx.outboxEvent.findFirst({
    where: {
      aggregateId: userId,
      eventType: "media.cleanup",
      status: { not: "PROCESSED" },
      payload: { path: ["mediaId"], equals: mediaId },
    },
    select: { id: true },
  });
  if (!existing)
    await tx.outboxEvent.create({
      data: {
        eventType: "media.cleanup",
        aggregateType: "User",
        aggregateId: userId,
        payload: { mediaId },
      },
    });
}
