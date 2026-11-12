import { describe, expect, it } from "vitest";
import { createPrismaClient } from "./prisma";

describe("Explicit Prisma dependency", () => {
  // Environment isolation is checked before an adapter can be constructed.
  it.each(["looply_dev", "looply_prod"])("rejects %s in test mode", (database) => {
    expect(() => createPrismaClient({ environment: "test", databaseUrl: `postgresql://fixture@localhost:1/${database}`, databaseConnectTimeoutMs: 1000 })).toThrow();
  });

  // An unreachable port demonstrates construction is lazy; no query or connection is requested here.
  it("exposes native transactions without connecting during composition", async () => {
    const client = createPrismaClient({ environment: "test", databaseUrl: "postgresql://fixture@localhost:1/looply_test", databaseConnectTimeoutMs: 1000 });
    expect(typeof client.$transaction).toBe("function");
    await client.$disconnect();
  });
});
