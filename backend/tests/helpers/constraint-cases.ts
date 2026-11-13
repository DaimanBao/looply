import { describe, expect, it } from "vitest";
import { createFixtures, updateRow, type SqlValue, type Table } from "./database-fixtures";
import { withTestTransaction } from "./test-database";

export type ConstraintCase = {
  name: string;
  changes: Record<string, SqlValue>;
  constraint?: string;
  code?: string;
};

/** Đăng ký trường hợp hợp lệ/không hợp lệ độc lập trên các hàng fixture đã lưu. */
export function constraintCases(table: Table, cases: ConstraintCase[]): void {
  describe(`${table} value constraints`, () => {
    // Mỗi trường hợp bắt đầu với đồ thị hợp lệ, chỉ đổi giá trị được nêu rồi rollback.
    it.each(cases)("$name", async ({ changes, constraint, code }) => {
      await withTestTransaction(async (client) => {
        const fixtures = await createFixtures(client);
        const write = updateRow(client, table, fixtures[table].id, changes);
        if (constraint || code) {
          await expect(write).rejects.toMatchObject({
            code: code ?? "23514",
            ...(constraint ? { constraint } : {}),
          });
        } else {
          const row = await write;
          expect(row.id).toBe(fixtures[table].id);
        }
      });
    });
  });
}
