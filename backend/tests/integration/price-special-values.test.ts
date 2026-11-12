import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { describe, expect, it } from "vitest";
import {
  createFixtures, insertRow, updateRow,
  type SqlValue, type Table, type TestRow,
} from "../helpers/database-fixtures";
import { withTestTransaction } from "../helpers/test-database";

type PriceTarget = {
  table: "listings" | "transaction_proposals";
  column: "price" | "proposedPrice" | "listedPriceSnapshot";
  constraint: string;
};
type PriceScenario = PriceTarget & {
  name: string;
  changes: Record<string, SqlValue>;
};

const targets: PriceTarget[] = [
  { table: "listings", column: "price", constraint: "ck_listing_price_type" },
  { table: "transaction_proposals", column: "proposedPrice", constraint: "ck_proposal_kind" },
  { table: "transaction_proposals", column: "listedPriceSnapshot", constraint: "ck_proposal_snapshot_not_nan" },
];
const scenarios: PriceScenario[] = [];
for (const target of targets) {
  const kinds = target.table === "listings" ? ["LISTED_PRICE"] : ["LISTED_PRICE", "NEGOTIATED_PRICE"];
  for (const type of ["SALE", "RENT"]) {
    for (const proposalKind of kinds) {
      scenarios.push({
        ...target, name: `${target.table}.${target.column} ${type} ${proposalKind}`,
        changes: { type, rentalUnit: type === "RENT" ? "DAY" : null,
          ...(target.table === "transaction_proposals" ? { proposalKind } : {}) },
      });
    }
  }
  if (target.column === "listedPriceSnapshot") {
    scenarios.push({ ...target, name: "EXCHANGE snapshot", changes: {
      type: "EXCHANGE", proposalKind: "EXCHANGE_CONTACT", proposedPrice: null, rentalUnit: null,
    } });
  }
}

/** Writes a new row or changes the fixture; new proposals first release the existing pending slot. */
async function writePrice(
  client: Client,
  input: { operation: "INSERT" | "UPDATE"; table: Table; original: TestRow; changes: Record<string, SqlValue> },
): Promise<TestRow> {
  const { operation, table, original, changes } = input;
  if (operation === "UPDATE") return updateRow(client, table, original.id, changes);
  if (table === "transaction_proposals") {
    await updateRow(client, table, original.id, { status: "REJECTED", resolvedAt: new Date() });
  }
  return insertRow(client, table, { ...original, id: randomUUID(), ...changes });
}

describe.each(["INSERT", "UPDATE"] as const)("Numeric price validity on %s", (operation) => {
  // Every NaN assertion reaches a price CHECK with valid unrelated keys and row shape.
  it.each(scenarios)("rejects NaN in $name", async ({ table, column, constraint, changes }) => {
    await withTestTransaction(async (client) => {
      const rows = await createFixtures(client);
      await expect(writePrice(client, {
        operation, table, original: rows[table], changes: { ...changes, [column]: "NaN" },
      })).rejects.toMatchObject({ code: "23514", constraint });
    });
  });

  // Fixed-precision NUMERIC already excludes infinities; retain that boundary for every price field.
  it.each(targets.flatMap((target) => ["Infinity", "-Infinity"].map((value) => ({ ...target, value }))))(
    "rejects $value in $table.$column", async ({ table, column, value }) => {
      await withTestTransaction(async (client) => {
        const rows = await createFixtures(client);
        await expect(writePrice(client, { operation, table, original: rows[table], changes: { [column]: value } }))
          .rejects.toMatchObject({ code: "22003" });
      });
    },
  );

  // The new guards must keep both supported finite decimal boundaries usable.
  it.each(targets.flatMap((target) => ["1", "999999999999999"].map((value) => ({ ...target, value }))))(
    "accepts $value in $table.$column", async ({ table, column, value }) => {
      await withTestTransaction(async (client) => {
        const rows = await createFixtures(client);
        const row = await writePrice(client, { operation, table, original: rows[table], changes: { [column]: value } });
        expect(row[column]).toBe(value);
      });
    },
  );

  // Nullable historical snapshots remain nullable; no extra requiredness is introduced.
  it("keeps a NULL snapshot valid", async () => {
    await withTestTransaction(async (client) => {
      const rows = await createFixtures(client);
      const row = await writePrice(client, { operation, table: "transaction_proposals", original: rows.transaction_proposals, changes: { listedPriceSnapshot: null } });
      expect(row.listedPriceSnapshot).toBeNull();
    });
  });

  // EXCHANGE continues to have no listing/proposed price or rental unit.
  it.each(["listings", "transaction_proposals"] as const)("keeps EXCHANGE NULL prices valid in %s", async (table) => {
    await withTestTransaction(async (client) => {
      const rows = await createFixtures(client);
      const changes: Record<string, SqlValue> = table === "listings"
        ? { type: "EXCHANGE", price: null, rentalUnit: null }
        : { type: "EXCHANGE", proposalKind: "EXCHANGE_CONTACT", proposedPrice: null, listedPriceSnapshot: null, rentalUnit: null };
      const row = await writePrice(client, { operation, table, original: rows[table], changes });
      expect(row.type).toBe("EXCHANGE");
    });
  });

  // A snapshot must be numeric even on resolved proposals; status cannot bypass its guard.
  it.each(["ACCEPTED", "REJECTED"])("rejects NaN snapshot in a %s proposal", async (status) => {
    await withTestTransaction(async (client) => {
      const rows = await createFixtures(client);
      await expect(writePrice(client, {
        operation, table: "transaction_proposals", original: rows.transaction_proposals,
        changes: { status, resolvedAt: new Date(), acceptedCycle: status === "ACCEPTED" ? 1 : null, listedPriceSnapshot: "NaN" },
      })).rejects.toMatchObject({ code: "23514", constraint: "ck_proposal_snapshot_not_nan" });
    });
  });
});

describe("Price field inventory", () => {
  // A new NUMERIC field must be explicitly reviewed rather than silently escaping price coverage.
  it("covers all three numeric columns in the database schema", async () => {
    await withTestTransaction(async (client) => {
      const result = await client.query<{ table_name: string; column_name: string; numeric_precision: number; numeric_scale: number }>(
        `SELECT table_name, column_name, numeric_precision, numeric_scale
         FROM information_schema.columns WHERE table_schema = 'public' AND data_type = 'numeric'
         ORDER BY table_name, column_name`,
      );
      expect(result.rows).toEqual([
        { table_name: "listings", column_name: "price", numeric_precision: 15, numeric_scale: 0 },
        { table_name: "transaction_proposals", column_name: "listedPriceSnapshot", numeric_precision: 15, numeric_scale: 0 },
        { table_name: "transaction_proposals", column_name: "proposedPrice", numeric_precision: 15, numeric_scale: 0 },
      ]);
    });
  });
});
