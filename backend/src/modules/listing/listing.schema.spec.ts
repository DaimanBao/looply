import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createListingSchema, patchListingSchema, manifestSchema } from "./listing.schema";

const image = randomUUID();
const sale = { title: "  Xe đạp thành phố  ", description: "Xe đạp còn tốt, xem trực tiếp tại nơi hẹn.", type: "SALE", price: "999999999999999", rentalUnit: null, provinceCode: "79", media: { imageIds: [image], videoId: null } };
describe("Listing input contract", () => {
  it("trims only ASCII spaces and counts Unicode code points", () => {
    expect(createListingSchema.parse(sale).title).toBe("Xe đạp thành phố");
    expect(createListingSchema.safeParse({ ...sale, title: "😀".repeat(150) }).success).toBe(true);
    expect(createListingSchema.safeParse({ ...sale, title: "😀".repeat(151) }).success).toBe(false);
    expect(createListingSchema.safeParse({ ...sale, title: "         short         " }).success).toBe(false);
  });
  it("rejects mass assignment, lossy prices and invalid final type/unit combinations", () => {
    for (const invalid of [{ ownerId: randomUUID() }, { version: 9 }, { price: 100 }, { price: "1e3" }, { price: "0" }, { rentalUnit: "DAY" }, { type: "RENT" }, { type: "EXCHANGE" }]) {
      expect(createListingSchema.safeParse({ ...sale, ...invalid }).success).toBe(false);
    }
    expect(createListingSchema.safeParse({ ...sale, type: "RENT", rentalUnit: "MONTH" }).success).toBe(true);
    expect(createListingSchema.safeParse({ ...sale, type: "EXCHANGE", price: null }).success).toBe(true);
  });
  it("requires version and mutable content and rejects duplicate/invalid covers", () => {
    for (const input of [{ title: sale.title }, { expectedVersion: "1", title: sale.title }, { expectedVersion: 1 }, { expectedVersion: 0, title: sale.title }]) expect(patchListingSchema.safeParse(input).success).toBe(false);
    for (const media of [{ imageIds: [], videoId: null }, { imageIds: [image, image.toUpperCase()], videoId: null }, { imageIds: [image], videoId: null, coverImageId: randomUUID() }, { imageIds: [image] }, { imageIds: [image], videoId: image }]) expect(manifestSchema.safeParse(media).success).toBe(false);
  });
});
