import { z } from "zod";
import {
  hashCursorQuery,
  invalidListingCursor,
  readCursorPayload,
  writeCursorPayload,
} from "./listing-cursor-codec";
import { listingId, type MyListingsQuery } from "./listing.schema";

const cursorSchema = z.strictObject({
  v: z.literal(1),
  scope: z.literal("my"),
  queryHash: z.string().regex(/^[a-f0-9]{64}$/),
  viewerId: listingId,
  asOf: z.iso.datetime(),
  seed: z.null(),
  last: z.strictObject({ createdAt: z.iso.datetime(), id: listingId }),
});
export type ListingCursor = z.infer<typeof cursorSchema>;

/** Chỉ coi cursor không ký là mốc biên đã kiểm tra; mọi trang vẫn áp dụng phân quyền. */
export function decodeMyCursor(query: MyListingsQuery, viewerId: string, now: Date): ListingCursor {
  const queryHash = hashCursorQuery({
    status: query.status ?? null,
    limit: query.limit,
    sort: "NEWEST",
  });
  if (!query.after)
    return {
      v: 1,
      scope: "my",
      queryHash,
      viewerId,
      asOf: now.toISOString(),
      seed: null,
      last: { createdAt: now.toISOString(), id: "ffffffff-ffff-4fff-bfff-ffffffffffff" },
    };
  try {
    const cursor = cursorSchema.parse(readCursorPayload(query.after));
    if (
      cursor.viewerId !== viewerId ||
      cursor.queryHash !== queryHash ||
      new Date(cursor.asOf) > now ||
      new Date(cursor.last.createdAt) > new Date(cursor.asOf)
    )
      throw new Error("Invalid binding");
    return cursor;
  } catch {
    throw invalidListingCursor();
  }
}
/** Mã hóa hàng cuối đã trả, không dùng hàng đọc trước. */
export function encodeMyCursor(
  cursor: ListingCursor,
  last: { id: string; createdAt: Date },
): string {
  return writeCursorPayload({
    ...cursor,
    last: { id: last.id, createdAt: last.createdAt.toISOString() },
  });
}
