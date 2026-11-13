import type { DatabaseTransaction } from "./prisma";

/** Lấy khóa tài nguyên theo transaction với thứ tự xác định để tránh deadlock liên luồng. */
export async function lockResources(tx: DatabaseTransaction, resources: string[]): Promise<void> {
  for (const resource of [...new Set(resources)].sort()) {
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${resource}, 0))`;
  }
}
