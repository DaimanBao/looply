import { createHash } from "node:crypto";
import { z } from "zod";
import { AppError } from "../../shared/errors/app-error";
import { listingId, type MyListingsQuery } from "./listing.schema";

const cursorSchema = z.strictObject({ v: z.literal(1), scope: z.literal("my"), queryHash: z.string().regex(/^[a-f0-9]{64}$/), viewerId: listingId, asOf: z.iso.datetime(), seed: z.null(), last: z.strictObject({ createdAt: z.iso.datetime(), id: listingId }) });
export type ListingCursor = z.infer<typeof cursorSchema>;
/** Binds continuation to the owner, selected status and page size. */
function queryHash(query: MyListingsQuery): string { return createHash("sha256").update(JSON.stringify({ status: query.status ?? null, limit: query.limit, sort: "NEWEST" })).digest("hex"); }
/** Treats an unsigned cursor only as a validated boundary; every page still applies authorization. */
export function decodeMyCursor(query: MyListingsQuery, viewerId: string, now: Date): ListingCursor {
  if (!query.after) return { v: 1, scope: "my", queryHash: queryHash(query), viewerId, asOf: now.toISOString(), seed: null, last: { createdAt: now.toISOString(), id: "ffffffff-ffff-4fff-bfff-ffffffffffff" } };
  try {
    const bytes = Buffer.from(query.after, "base64url");
    if (bytes.toString("base64url") !== query.after) throw new Error("Invalid encoding");
    const cursor = cursorSchema.parse(JSON.parse(bytes.toString("utf8")));
    if (cursor.viewerId !== viewerId || cursor.queryHash !== queryHash(query) || new Date(cursor.asOf) > now || new Date(cursor.last.createdAt) > new Date(cursor.asOf)) throw new Error("Invalid binding");
    return cursor;
  } catch { throw new AppError(400, "VALIDATION_ERROR", "Invalid continuation cursor.", [{ path: "query.after", code: "custom" }]); }
}
/** Encodes the last returned row, never the lookahead row. */
export function encodeMyCursor(cursor: ListingCursor, last: { id: string; createdAt: Date }): string { return Buffer.from(JSON.stringify({ ...cursor, last: { id: last.id, createdAt: last.createdAt.toISOString() } })).toString("base64url"); }
