import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { describe, expect, it } from "vitest";
import {
  createFixtures,
  insertRow,
  updateRow,
  type SqlValue,
  type Table,
  type TestRow,
} from "../helpers/database-fixtures";
import { withTestTransaction } from "../helpers/test-database";

type PriceTarget = {
  table: "listings" | "transaction_proposals" | "listing_card_snapshots";
  column: "price" | "proposedPrice" | "listedPriceSnapshot" | "listedPrice";
  constraint: string;
};
type PriceScenario = PriceTarget & {
  name: string;
  changes: Record<string, SqlValue>;
};

const targets: PriceTarget[] = [
  { table: "listing_card_snapshots", column: "listedPrice", constraint: "ck_snapshot_terms" },
  { table: "listings", column: "price", constraint: "ck_listing_price_type" },
  { table: "transaction_proposals", column: "proposedPrice", constraint: "ck_proposal_kind" },
  {
    table: "transaction_proposals",
    column: "listedPriceSnapshot",
    constraint: "ck_proposal_snapshot_not_nan",
  },
];
const scenarios: PriceScenario[] = [];
for (const target of targets) {
  const kinds =
    target.table === "transaction_proposals" ? ["LISTED_PRICE", "NEGOTIATED_PRICE"] : ["LISTED_PRICE"];
  for (const type of ["SALE", "RENT"]) {
    for (const proposalKind of kinds) {
      scenarios.push({
        ...target,
        name: `${target.table}.${target.column} ${type} ${proposalKind}`,
        changes: {
          type,
          rentalUnit: type === "RENT" ? "DAY" : null,
          ...(target.table === "transaction_proposals" ? { proposalKind } : {}),
        },
      });
    }
  }
  if (target.column === "listedPriceSnapshot") {
    scenarios.push({
      ...target,
      name: "EXCHANGE snapshot",
      changes: {
        type: "EXCHANGE",
        proposalKind: "EXCHANGE_CONTACT",
        proposedPrice: null,
        rentalUnit: null,
      },
    });
  }
  if (target.table === "listing_card_snapshots") {
    scenarios.push({
      ...target,
      name: "EXCHANGE listing card snapshot",
      changes: { type: "EXCHANGE", rentalUnit: null },
    });
  }
}

/** Ghi fixture với khóa ảnh riêng; đề xuất mới giải phóng slot đang chờ hiện có trước. */
async function writePrice(
  client: Client,
  input: {
    operation: "INSERT" | "UPDATE";
    table: Table;
    original: TestRow;
    changes: Record<string, SqlValue>;
  },
): Promise<TestRow> {
  const { operation, table, original, changes } = input;
  if (operation === "UPDATE") return updateRow(client, table, original.id, changes);
  if (table === "transaction_proposals") {
    await updateRow(client, table, original.id, { status: "REJECTED", resolvedAt: new Date() });
  }
  return insertRow(client, table, {
    ...original,
    id: randomUUID(),
    ...(table === "listing_card_snapshots"
      ? { imageStorageKey: `chat-snapshot/${randomUUID()}.webp` }
      : {}),
    ...changes,
  });
}

describe.each(["INSERT", "UPDATE"] as const)("Numeric price validity on %s", (operation) => {
  // Mọi assertion NaN đến được CHECK giá với các khóa khác và dạng hàng hợp lệ.
  it.each(scenarios)("rejects NaN in $name", async ({ table, column, constraint, changes }) => {
    await withTestTransaction(async (client) => {
      const rows = await createFixtures(client);
      await expect(
        writePrice(client, {
          operation,
          table,
          original: rows[table],
          changes: { ...changes, [column]: "NaN" },
        }),
      ).rejects.toMatchObject({ code: "23514", constraint });
    });
  });

  // NUMERIC độ chính xác cố định đã loại vô cực; giữ ranh giới đó cho mọi trường giá.
  it.each(
    targets.flatMap((target) => ["Infinity", "-Infinity"].map((value) => ({ ...target, value }))),
  )("rejects $value in $table.$column", async ({ table, column, value }) => {
    await withTestTransaction(async (client) => {
      const rows = await createFixtures(client);
      await expect(
        writePrice(client, {
          operation,
          table,
          original: rows[table],
          changes: { [column]: value },
        }),
      ).rejects.toMatchObject({ code: "22003" });
    });
  });

  // Các kiểm tra mới phải giữ cả hai biên thập phân hữu hạn được hỗ trợ dùng được.
  it.each(
    targets.flatMap((target) => ["1", "999999999999999"].map((value) => ({ ...target, value }))),
  )("accepts $value in $table.$column", async ({ table, column, value }) => {
    await withTestTransaction(async (client) => {
      const rows = await createFixtures(client);
      const row = await writePrice(client, {
        operation,
        table,
        original: rows[table],
        changes: { [column]: value },
      });
      expect(row[column]).toBe(value);
    });
  });

  // Snapshot lịch sử nullable vẫn nullable; không thêm yêu cầu bắt buộc.
  it("keeps a NULL snapshot valid", async () => {
    await withTestTransaction(async (client) => {
      const rows = await createFixtures(client);
      const row = await writePrice(client, {
        operation,
        table: "transaction_proposals",
        original: rows.transaction_proposals,
        changes: { listedPriceSnapshot: null },
      });
      expect(row.listedPriceSnapshot).toBeNull();
    });
  });

  // EXCHANGE tiếp tục không có giá listing/đề xuất hoặc đơn vị thuê.
  it.each(["listings", "transaction_proposals", "listing_card_snapshots"] as const)(
    "keeps EXCHANGE NULL prices valid in %s",
    async (table) => {
      await withTestTransaction(async (client) => {
        const rows = await createFixtures(client);
        const changes: Record<string, SqlValue> =
          table === "listings"
            ? { type: "EXCHANGE", price: null, rentalUnit: null }
            : table === "listing_card_snapshots"
              ? { type: "EXCHANGE", listedPrice: null, rentalUnit: null }
              : {
                  type: "EXCHANGE",
                  proposalKind: "EXCHANGE_CONTACT",
                  proposedPrice: null,
                  listedPriceSnapshot: null,
                  rentalUnit: null,
                };
        const row = await writePrice(client, { operation, table, original: rows[table], changes });
        expect(row.type).toBe("EXCHANGE");
      });
    },
  );

  // Snapshot phải là số kể cả đề xuất đã giải quyết; trạng thái không được bỏ qua kiểm tra.
  it.each(["ACCEPTED", "REJECTED"])("rejects NaN snapshot in a %s proposal", async (status) => {
    await withTestTransaction(async (client) => {
      const rows = await createFixtures(client);
      await expect(
        writePrice(client, {
          operation,
          table: "transaction_proposals",
          original: rows.transaction_proposals,
          changes: {
            status,
            resolvedAt: new Date(),
            acceptedCycle: status === "ACCEPTED" ? 1 : null,
            listedPriceSnapshot: "NaN",
          },
        }),
      ).rejects.toMatchObject({ code: "23514", constraint: "ck_proposal_snapshot_not_nan" });
    });
  });
});

describe("Price field inventory", () => {
  // Trường NUMERIC mới phải được review tường minh, không âm thầm nằm ngoài kiểm thử giá.
  it("covers all numeric price columns in the database schema", async () => {
    await withTestTransaction(async (client) => {
      const result = await client.query<{
        table_name: string;
        column_name: string;
        numeric_precision: number;
        numeric_scale: number;
      }>(
        `SELECT table_name, column_name, numeric_precision, numeric_scale
         FROM information_schema.columns WHERE table_schema = 'public' AND data_type = 'numeric'
         ORDER BY table_name, column_name`,
      );
      expect(result.rows).toEqual([
        {
          table_name: "listing_card_snapshots",
          column_name: "listedPrice",
          numeric_precision: 15,
          numeric_scale: 0,
        },
        { table_name: "listings", column_name: "price", numeric_precision: 15, numeric_scale: 0 },
        {
          table_name: "transaction_proposals",
          column_name: "listedPriceSnapshot",
          numeric_precision: 15,
          numeric_scale: 0,
        },
        {
          table_name: "transaction_proposals",
          column_name: "proposedPrice",
          numeric_precision: 15,
          numeric_scale: 0,
        },
      ]);
    });
  });
});
