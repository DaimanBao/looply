import { describe, expect, it } from "vitest";
import { createFixtures, updateRow, type SqlValue, type Table } from "./database-fixtures";
import { withTestTransaction } from "./test-database";

export type ConstraintCase = {
  name: string;
  changes: Record<string, SqlValue>;
  constraint?: string;
  code?: string;
};

/** Registers independent positive and negative cases against persisted fixture rows. */
export function constraintCases(table: Table, cases: ConstraintCase[]): void {
  describe(`${table} value constraints`, () => {
    // Every case starts with a valid graph, changes only the named values, and rolls back.
    it.each(cases)("$name", async ({ changes, constraint, code }) => {
      await withTestTransaction(async (client) => {
        const fixtures = await createFixtures(client);
        const write = updateRow(client, table, fixtures[table].id, changes);
        if (constraint || code) {
          await expect(write).rejects.toMatchObject({ code: code ?? "23514", ...(constraint ? { constraint } : {}) });
        } else {
          const row = await write;
          expect(row.id).toBe(fixtures[table].id);
        }
      });
    });
  });
}
