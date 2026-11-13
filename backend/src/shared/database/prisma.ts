import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "../../generated/prisma/client";
import { validateDatabaseUrl } from "../../config/database-url";
import type { AppConfig } from "../../config/environment";

export type DatabaseLifecycle = Pick<PrismaClient, "$connect" | "$disconnect">;
export type DatabaseTransaction = Prisma.TransactionClient;

/** Tạo client tường minh cho môi trường đã chọn; chỉ import không gây tác dụng phụ database. */
export function createPrismaClient(
  config: Pick<AppConfig, "databaseUrl" | "environment" | "databaseConnectTimeoutMs">,
): PrismaClient {
  const connectionString = validateDatabaseUrl(config.databaseUrl, config.environment);
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString,
      connectionTimeoutMillis: config.databaseConnectTimeoutMs,
    }),
  });
}
