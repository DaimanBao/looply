import { describe, expect, it } from "vitest";
import { createAuthFixture } from "../helpers/auth-fixture";
import { provinceCatalog, seedProvinceCatalog } from "../../src/modules/user/province-catalog";

describe("Official Province catalog", () => {
  it("seeds 34 unique official codes idempotently and preserves UUIDs in a rollback transaction", async () => {
    const fixture = await createAuthFixture();
    const rollback = new Error("Fixture rollback");
    try {
      expect(provinceCatalog).toHaveLength(34);
      expect(new Set(provinceCatalog.map((province) => province.code)).size).toBe(34);
      await fixture.db
        .$transaction(async (tx) => {
          await seedProvinceCatalog(tx);
          const before = await tx.province.findMany({
            where: { code: { in: provinceCatalog.map((province) => province.code) } },
            orderBy: { code: "asc" },
          });
          await seedProvinceCatalog(tx);
          const after = await tx.province.findMany({
            where: { code: { in: provinceCatalog.map((province) => province.code) } },
            orderBy: { code: "asc" },
          });
          expect(after).toHaveLength(34);
          expect(after.map((province) => province.id)).toEqual(
            before.map((province) => province.id),
          );
          expect(after.find((province) => province.code === "79")?.name).toBe(
            "Thành phố Hồ Chí Minh",
          );
          throw rollback;
        })
        .catch((error: unknown) => {
          if (error !== rollback) throw error;
        });
    } finally {
      await fixture.dispose();
    }
  });
});
