import type { DatabaseTransaction } from "./prisma";

/** Acquires transaction-scoped resource locks in deterministic order to avoid cross-flow deadlocks. */
export async function lockResources(tx: DatabaseTransaction, resources: string[]): Promise<void> {
  for (const resource of [...new Set(resources)].sort()) {
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${resource}, 0))`;
  }
}
