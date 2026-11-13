import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { withTestTransaction } from "../helpers/test-database";
import { describe, expect, it } from "vitest";

type ListingInput = {
  type?: "SALE" | "EXCHANGE" | "RENT";
  status?: "ACTIVE" | "HIDDEN" | "DELETED";
  price?: number | null;
  rentalUnit?: "DAY" | "MONTH" | null;
  activeCycle?: number;
  version?: number;
  title?: string;
  description?: string;
  deletedAt?: Date | null;
};

/** Tạo phụ thuộc listing trong transaction đã xác minh chỉ rollback. */
async function withListingTransaction(
  run: (client: Client, createListing: (input?: ListingInput) => Promise<void>) => Promise<void>,
): Promise<void> {
  await withTestTransaction(async (client) => {
    const provinceId = randomUUID();
    const ownerId = randomUUID();
    const suffix = randomUUID().replace(/-/g, "").slice(0, 12);

    await client.query(
      `INSERT INTO provinces ("id", "code", "name", "updatedAt")
       VALUES ($1, $2, $3, NOW())`,
      [provinceId, `TEST_${suffix}`, "Test Province"],
    );

    await client.query(
      `INSERT INTO users
       ("id", "username", "displayName", "updatedAt")
       VALUES ($1, $2, $3, NOW())`,
      [ownerId, `test_${suffix}`, "Test Owner"],
    );

    /** Thêm một listing với giá trị của trường hợp constraint hiện tại. */
    const createListing = async (input: ListingInput = {}): Promise<void> => {
      const {
        type = "SALE",
        status = "ACTIVE",
        price = 100000,
        rentalUnit = null,
        activeCycle = 1,
        version = 1,
        title = "Valid listing title",
        description = "A sufficiently detailed listing description.",
        deletedAt = null,
      } = input;

      await client.query(
        `INSERT INTO listings
         ("id", "ownerId", "provinceId", "title", "searchTitle",
          "description", "type", "status", "price", "rentalUnit",
          "activeCycle", "version", "deletedAt", "updatedAt")
         VALUES
         ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, NOW())`,
        [
          randomUUID(),
          ownerId,
          provinceId,
          title,
          title.toLowerCase(),
          description,
          type,
          status,
          price,
          rentalUnit,
          activeCycle,
          version,
          deletedAt,
        ],
      );
    };

    await run(client, createListing);
  });
}

describe("Listing database constraints", () => {
  it.each([
    ["SALE", { type: "SALE", price: 100000, rentalUnit: null }],
    ["EXCHANGE", { type: "EXCHANGE", price: null, rentalUnit: null }],
    ["RENT", { type: "RENT", price: 50000, rentalUnit: "DAY" }],
  ] as const)("accepts valid %s listing", async (_name, input) => {
    await withListingTransaction(async (_client, createListing) => {
      await expect(createListing({ ...input })).resolves.toBeUndefined();
    });
  });

  it.each([
    ["SALE without price", { type: "SALE", price: null }],
    ["SALE with rental unit", { type: "SALE", rentalUnit: "DAY" }],
    ["EXCHANGE with price", { type: "EXCHANGE", price: 100000 }],
    ["RENT without price", { type: "RENT", price: null, rentalUnit: "DAY" }],
    ["RENT without rental unit", { type: "RENT", price: 50000 }],
    ["negative price", { type: "SALE", price: -1 }],
  ] as const)("rejects %s", async (_name, input) => {
    await withListingTransaction(async (_client, createListing) => {
      await expect(createListing({ ...input })).rejects.toMatchObject({
        code: "23514",
        constraint: "ck_listing_price_type",
      });
    });
  });

  it.each([
    ["activeCycle = 0", { activeCycle: 0 }],
    ["version = 0", { version: 0 }],
  ] as const)("rejects %s", async (_name, input) => {
    await withListingTransaction(async (_client, createListing) => {
      await expect(createListing({ ...input })).rejects.toMatchObject({
        code: "23514",
        constraint: "ck_listing_cycle_version",
      });
    });
  });

  it.each([
    ["DELETED without deletedAt", { status: "DELETED" }],
    ["ACTIVE with deletedAt", { deletedAt: new Date() }],
  ] as const)("rejects %s", async (_name, input) => {
    await withListingTransaction(async (_client, createListing) => {
      await expect(createListing({ ...input })).rejects.toMatchObject({
        code: "23514",
        constraint: "ck_listing_deleted_at",
      });
    });
  });

  it("accepts DELETED with deletedAt", async () => {
    await withListingTransaction(async (_client, createListing) => {
      await expect(
        createListing({
          status: "DELETED",
          deletedAt: new Date(),
        }),
      ).resolves.toBeUndefined();
    });
  });

  it.each([
    ["short title", { title: "Short" }],
    ["short description", { description: "Too short" }],
    ["blank title", { title: "          " }],
    ["blank description", { description: "                    " }],
  ] as const)("rejects %s", async (_name, input) => {
    await withListingTransaction(async (_client, createListing) => {
      await expect(createListing({ ...input })).rejects.toMatchObject({
        code: "23514",
        constraint: "ck_listing_title_description",
      });
    });
  });
});
