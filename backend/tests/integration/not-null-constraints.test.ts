import { describe, expect, it } from "vitest";
import { createFixtures, updateRow } from "../helpers/database-fixtures";
import { withTestTransaction } from "../helpers/test-database";

describe("Required database columns", () => {
  // Cô lập mỗi cột NOT NULL bằng savepoint để một vi phạm không che vi phạm tiếp theo.
  it("rejects NULL in every required column across all 17 models", async () => {
    await withTestTransaction(async (client) => {
      const rows = await createFixtures(client);
      const columns = await client.query<{ table_name: string; column_name: string }>(
        `SELECT table_name, column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND is_nullable = 'NO' AND table_name <> '_prisma_migrations'
         ORDER BY table_name, ordinal_position`,
      );
      let checked = 0;
      for (const [table, row] of Object.entries(rows)) {
        for (const column of columns.rows.filter((entry) => entry.table_name === table)) {
          await client.query("SAVEPOINT required_column");
          // Định danh chỉ đến từ danh sách bảng fixture và catalog PostgreSQL của chúng ta.
          await expect(
            updateRow(client, table as keyof typeof rows, row.id, { [column.column_name]: null }),
            `${table}.${column.column_name}`,
          ).rejects.toMatchObject({ code: "23502", column: column.column_name });
          await client.query("ROLLBACK TO SAVEPOINT required_column");
          checked++;
        }
      }
      expect(new Set(columns.rows.map((column) => column.table_name)).size).toBe(17);
      expect(checked).toBe(columns.rows.length);
    });
  });
});
