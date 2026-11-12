import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { afterAll, describe, expect, it } from "vitest";

const testUrl = process.env.TEST_DATABASE_URL;

if (!testUrl) {
  throw new Error("TEST_DATABASE_URL is required");
}

const parsedUrl = new URL(testUrl);

if (parsedUrl.pathname !== "/looply_test") {
  throw new Error(
    "Integration tests must use the looply_test database",
  );
}

const adapter = new PrismaPg({
  connectionString: testUrl,
});

const prisma = new PrismaClient({ adapter });

describe("PostgreSQL integration", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("connects to the isolated test database", async () => {
    const result = await prisma.$queryRaw<
      Array<{ database_name: string }>
    >`SELECT current_database() AS database_name`;

    expect(result[0]?.database_name).toBe("looply_test");
  });
});