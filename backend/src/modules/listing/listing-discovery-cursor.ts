import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { listingId } from "./listing.schema";
import type { DiscoveryQuery, PageQuery } from "./listing-discovery.schema";
import { AppError } from "../../shared/errors/app-error";

// Adapter mã hóa trực tiếp timestamp ISO; PostgreSQL từ chối năm ISO bằng không, kể cả biên cửa sổ suy ra.
const minimumTimestamp = Date.parse("0001-01-01T00:00:00.000Z");
const timestamp = z.iso
  .datetime()
  .refine((value) => Number.isFinite(Date.parse(value)) && Date.parse(value) >= minimumTimestamp);
const boundarySchema = z.union([
  z.strictObject({ id: listingId, createdAt: timestamp }),
  z.strictObject({ id: listingId, price: z.string().regex(/^[1-9][0-9]{0,14}$/) }),
  z.strictObject({ id: listingId, rank: z.string().regex(/^[a-f0-9]{32}$/) }),
]);
const cursorSchema = z.strictObject({
  v: z.literal(1),
  scope: z.string().max(64),
  queryHash: z.string().regex(/^[a-f0-9]{64}$/),
  viewerId: listingId.nullable(),
  asOf: timestamp,
  seed: z
    .string()
    .regex(/^[a-f0-9]{32}$/)
    .nullable(),
  last: boundarySchema.nullable(),
});
export type DiscoveryCursor = z.infer<typeof cursorSchema>;
export type PageBoundary = z.infer<typeof boundarySchema>;
export type DiscoveryScope = "discovery" | "followed" | `user:${string}`;

/** Băm ngữ nghĩa chuẩn có hiệu lực, kể cả kích thước trang, thay vì thứ tự tham số HTTP. */
function queryHash(query: DiscoveryQuery | PageQuery): string {
  const semantics =
    "q" in query
      ? {
          q: query.q,
          feed: query.feed,
          provinceCode: query.provinceCode ?? null,
          type: query.type ?? null,
          rentalUnit: query.rentalUnit ?? null,
          minPrice: query.minPrice ?? null,
          maxPrice: query.maxPrice ?? null,
          postedWithin: query.postedWithin,
          sort: query.sort,
          limit: query.limit,
        }
      : { sort: "NEWEST", limit: query.limit };
  return createHash("sha256").update(JSON.stringify(semantics)).digest("hex");
}
/** Kiểm tra metadata phân trang không ký; điều kiện hiển thị và lọc vẫn áp dụng tại database cho từng trang. */
export function decodeDiscoveryCursor(
  query: DiscoveryQuery | PageQuery,
  scope: DiscoveryScope,
  viewerId: string | null,
  now: Date,
): DiscoveryCursor {
  const sort = "sort" in query ? query.sort : "NEWEST";
  const hash = queryHash(query);
  if (!query.after)
    return {
      v: 1,
      scope,
      queryHash: hash,
      viewerId,
      asOf: now.toISOString(),
      seed: sort === "RANDOM" ? randomBytes(16).toString("hex") : null,
      last: null,
    };
  try {
    const bytes = Buffer.from(query.after, "base64url");
    if (bytes.toString("base64url") !== query.after) throw new Error("Invalid encoding");
    const cursor = cursorSchema.parse(JSON.parse(bytes.toString("utf8")));
    if (
      cursor.scope !== scope ||
      cursor.viewerId !== viewerId ||
      cursor.queryHash !== hash ||
      new Date(cursor.asOf) > now ||
      !cursor.last
    )
      throw new Error("Invalid binding");
    if ((sort === "RANDOM") !== (cursor.seed !== null)) throw new Error("Invalid seed");
    if (
      sort === "RANDOM"
        ? !("rank" in cursor.last)
        : sort.startsWith("PRICE_")
          ? !("price" in cursor.last)
          : !("createdAt" in cursor.last)
    )
      throw new Error("Invalid sort boundary");
    const window = "postedWithin" in query ? postedWindow(query.postedWithin) : null;
    if (Date.parse(cursor.asOf) - (window ?? 0) < minimumTimestamp)
      throw new Error("Invalid window boundary");
    if ("createdAt" in cursor.last) {
      const last = Date.parse(cursor.last.createdAt);
      const asOf = Date.parse(cursor.asOf);
      if (last > asOf || (window !== null && last < asOf - window))
        throw new Error("Invalid time boundary");
    }
    return cursor;
  } catch {
    throw new AppError(400, "VALIDATION_ERROR", "Invalid continuation cursor.", [
      { path: "query.after", code: "custom" },
    ]);
  }
}
/** Mã hóa hàng cuối đã trả thay vì ứng viên đọc trước. */
export function encodeDiscoveryCursor(cursor: DiscoveryCursor, last: PageBoundary): string {
  return Buffer.from(JSON.stringify({ ...cursor, last })).toString("base64url");
}
/** Neo bộ lọc ngày tương đối vào cùng thời điểm UTC suốt phiên cuộn. */
export function postedWindow(value: DiscoveryQuery["postedWithin"]): number | null {
  return value === "ALL" ? null : { "24H": 1, "7D": 7, "30D": 30 }[value] * 86400000;
}
