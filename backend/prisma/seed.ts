import "dotenv/config";
import { loadConfig } from "../src/config/environment";
import { createPrismaClient } from "../src/shared/database/prisma";
import { seedProvinceCatalog } from "../src/modules/user/province-catalog";

/** Chỉ seed danh mục tham chiếu đã duyệt sau khi xác minh đích development/test local thực tế. */
async function main(): Promise<void> {
  const config = loadConfig();
  if (config.environment === "production") throw new Error("Production seed is not authorized");
  const db = createPrismaClient(config);
  try {
    const expected = config.environment === "test" ? "looply_test" : "looply_dev";
    const actual = await db.$queryRaw<Array<{ name: string }>>`SELECT current_database() AS name`;
    if (actual[0]?.name !== expected) throw new Error("Unexpected seed target");
    await db.$transaction(async (tx) => seedProvinceCatalog(tx));
    console.log("Seeded 34 official provinces without changing existing identifiers.");
  } finally {
    await db.$disconnect();
  }
}
main().catch(() => {
  console.error("Province seed failed. Check target configuration and database availability.");
  process.exitCode = 1;
});
