import { z } from "zod";
import { normalizeListingTitle } from "./listing-search";

// Tham số text PostgreSQL không chứa được NUL; từ chối khi validation HTTP để tránh lỗi database.
const queryText = z
  .string()
  .refine((value) => !value.includes("\u0000"), "NUL is not supported")
  .transform(normalizeListingTitle)
  .refine((value) => [...value].length <= 150, "Query exceeds 150 code points")
  .default("");
const price = z.string().regex(/^[1-9][0-9]{0,14}$/);
const limit = z
  .string()
  .regex(/^\d+$/)
  .transform(Number)
  .pipe(z.number().int().min(1).max(48))
  .default(12);
const sort = z.enum(["NEWEST", "OLDEST", "PRICE_ASC", "PRICE_DESC", "RANDOM"]);
export const pageQuerySchema = z.strictObject({
  limit,
  after: z
    .string()
    .min(1)
    .max(2048)
    .regex(/^[A-Za-z0-9_-]+$/)
    .optional(),
});
export const suggestionsSchema = z.strictObject({ q: queryText });
const discoveryFields = {
  ...pageQuerySchema.shape,
  q: queryText,
  feed: z.enum(["search", "nearby", "national"]).default("search"),
  provinceCode: z
    .string()
    .min(1)
    .max(32)
    .refine((value) => !value.includes("\u0000"), "NUL is not supported")
    .optional(),
  type: z.enum(["SALE", "RENT", "EXCHANGE"]).optional(),
  rentalUnit: z.enum(["DAY", "MONTH"]).optional(),
  minPrice: price.optional(),
  maxPrice: price.optional(),
  postedWithin: z.enum(["ALL", "24H", "7D", "30D"]).default("ALL"),
  sort: sort.optional(),
};
export const discoveryQuerySchema = z
  .strictObject(discoveryFields)
  .superRefine((value, context) => {
    /** Gắn mỗi tổ hợp sai với trường client cần thay đổi. */
    const issue = (path: string, message: string) =>
      context.addIssue({ code: "custom", path: [path], message });
    const sort = value.sort ?? (value.feed === "national" ? "RANDOM" : "NEWEST");
    if (value.feed === "nearby" && !value.provinceCode)
      issue("provinceCode", "Nearby requires a province");
    if (value.feed === "national" && value.provinceCode)
      issue("provinceCode", "National cannot restrict province");
    if (sort === "RANDOM" && (value.feed !== "national" || value.q !== ""))
      issue("sort", "Random requires national feed and empty query");
    if (value.rentalUnit && value.type !== "RENT") issue("rentalUnit", "Rental unit requires RENT");
    if (value.minPrice || value.maxPrice || sort.startsWith("PRICE_")) {
      if (value.type !== "SALE" && value.type !== "RENT")
        issue("type", "Choose one comparable transaction type");
      if (value.type === "RENT" && !value.rentalUnit)
        issue("rentalUnit", "Rental price requires a unit");
    }
    if (
      value.minPrice &&
      value.maxPrice &&
      price.safeParse(value.minPrice).success &&
      price.safeParse(value.maxPrice).success &&
      BigInt(value.minPrice) > BigInt(value.maxPrice)
    )
      issue("maxPrice", "Maximum must be at least minimum");
  })
  .transform((value) => ({
    ...value,
    sort: value.sort ?? (value.feed === "national" ? ("RANDOM" as const) : ("NEWEST" as const)),
  }));
export type DiscoveryQuery = z.infer<typeof discoveryQuerySchema>;
export type PageQuery = z.infer<typeof pageQuerySchema>;
