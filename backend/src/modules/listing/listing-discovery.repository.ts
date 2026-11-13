import { Prisma } from "../../generated/prisma/client";
import type { DatabaseTransaction } from "../../shared/database/prisma";
import { visibleUserSql, visibleUserWhere } from "../user";
import { listingProjection } from "./listing.repository";
import type { DiscoveryQuery, PageQuery } from "./listing-discovery.schema";
import { postedWindow, type DiscoveryCursor } from "./listing-discovery-cursor";

export type DiscoveryCandidate = { id: string; createdAt: Date; price: Prisma.Decimal | null; rank: string | null };
/** Escapes LIKE metacharacters so search input always denotes literal title text. */
function titlePattern(query: string): string { return `%${query.replace(/[\\%_]/g, "\\$&")}%`; }
/** Shares the public predicate between suggestions and every discovery page. */
function publicSql(viewerId?: string): Prisma.Sql { return Prisma.sql`l.status = 'ACTIVE' AND l."deletedAt" IS NULL AND ${visibleUserSql(Prisma.sql`l."ownerId"`, viewerId)}`; }

/** Builds the exact bounded query used in production and in PostgreSQL EXPLAIN verification. */
export function discoveryStatement(query: DiscoveryQuery | PageQuery, cursor: DiscoveryCursor, viewerId?: string): Prisma.Sql {
    const filters: Prisma.Sql[] = [publicSql(viewerId), Prisma.sql`l."createdAt" <= ${new Date(cursor.asOf)}`];
    if (cursor.scope === "followed") filters.push(Prisma.sql`EXISTS (SELECT 1 FROM listing_follows f WHERE f."listingId" = l.id AND f."userId" = ${viewerId}::uuid)`);
    if (cursor.scope.startsWith("user:")) filters.push(Prisma.sql`l."ownerId" = ${cursor.scope.slice(5)}::uuid`);
    if ("q" in query) {
      if (query.q) filters.push(Prisma.sql`l."searchTitle" LIKE ${titlePattern(query.q)} ESCAPE ${"\\"}`);
      if (query.type) filters.push(Prisma.sql`l.type = ${query.type}::"ListingType"`);
      if (query.rentalUnit) filters.push(Prisma.sql`l."rentalUnit" = ${query.rentalUnit}::"RentalUnit"`);
      if (query.provinceCode) filters.push(Prisma.sql`EXISTS (SELECT 1 FROM provinces p WHERE p.id = l."provinceId" AND p.code = ${query.provinceCode})`);
      if (query.minPrice) filters.push(Prisma.sql`l.price >= ${query.minPrice}::numeric`);
      if (query.maxPrice) filters.push(Prisma.sql`l.price <= ${query.maxPrice}::numeric`);
      const window = postedWindow(query.postedWithin);
      if (window !== null) filters.push(Prisma.sql`l."createdAt" >= ${new Date(Date.parse(cursor.asOf) - window)}`);
    }
    const sort = "sort" in query ? query.sort : "NEWEST";
    const ascending = sort === "OLDEST" || sort === "PRICE_ASC" || sort === "RANDOM";
    const direction = ascending ? Prisma.sql`ASC` : Prisma.sql`DESC`;
    const operator = ascending ? Prisma.sql`>` : Prisma.sql`<`;
    const rank = sort === "RANDOM" ? Prisma.sql`md5(${cursor.seed}::text || ':' || lower(l.id::text)) COLLATE "C"` : Prisma.sql`NULL::text`;
    const key = sort === "RANDOM" ? rank : sort.startsWith("PRICE_") ? Prisma.sql`l.price` : Prisma.sql`l."createdAt"`;
    if (cursor.last) {
      const last = cursor.last;
      const boundary = "rank" in last ? Prisma.sql`${last.rank}::text COLLATE "C"` : "price" in last ? Prisma.sql`${last.price}::numeric` : Prisma.sql`${new Date(last.createdAt)}`;
      filters.push(Prisma.sql`(${key}, l.id) ${operator} (${boundary}, ${last.id}::uuid)`);
    }
    return Prisma.sql`SELECT l.id, l."createdAt", l.price, ${rank} AS rank FROM listings l
      WHERE ${Prisma.join(filters, " AND ")} ORDER BY ${key} ${direction}, l.id ${direction} LIMIT ${query.limit + 1}`;
}
export class ListingDiscoveryRepository {
  /** Selects only a bounded keyset in PostgreSQL; all dynamic values are bound parameters. */
  candidates(query: DiscoveryQuery | PageQuery, cursor: DiscoveryCursor, viewerId: string | undefined, tx: DatabaseTransaction) {
    return tx.$queryRaw<DiscoveryCandidate[]>(discoveryStatement(query, cursor, viewerId));
  }
  /** Reapplies visibility during bounded hydration, preventing stale ID selection from exposing hidden/private data. */
  async rows(ids: string[], viewerId: string | undefined, followed: boolean, tx: DatabaseTransaction) {
    return tx.listing.findMany({ where: { id: { in: ids }, status: "ACTIVE", deletedAt: null, owner: visibleUserWhere(viewerId), ...(followed ? { followers: { some: { userId: viewerId } } } : {}) }, include: { ...listingProjection, followers: { where: viewerId ? { userId: viewerId } : { id: { in: [] } }, select: { id: true } } } });
  }
  /** Returns only lightweight autocomplete fields, without hydration or internal metadata. */
  suggestions(q: string, viewerId: string | undefined, tx: DatabaseTransaction) {
    return tx.$queryRaw<Array<{ id: string; title: string }>>(Prisma.sql`SELECT l.id, l.title FROM listings l WHERE ${publicSql(viewerId)} AND l."searchTitle" LIKE ${titlePattern(q)} ESCAPE ${"\\"} ORDER BY l."createdAt" DESC, l.id DESC LIMIT 8`);
  }
}
