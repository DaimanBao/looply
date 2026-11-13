import { Prisma } from "../../generated/prisma/client";
import type { DatabaseTransaction } from "../../shared/database/prisma";
import { visibleUserSql, visibleUserWhere } from "../user";
import { listingProjection } from "./listing.repository";
import type { DiscoveryQuery, PageQuery } from "./listing-discovery.schema";
import { postedWindow, type DiscoveryCursor } from "./listing-discovery-cursor";

export type DiscoveryCandidate = {
  id: string;
  createdAt: Date;
  price: Prisma.Decimal | null;
  rank: string | null;
};
/** Escape ký tự đặc biệt LIKE để đầu vào tìm kiếm luôn là văn bản tiêu đề nguyên nghĩa. */
function titlePattern(query: string): string {
  return `%${query.replace(/[\\%_]/g, "\\$&")}%`;
}
/** Dùng chung điều kiện công khai cho gợi ý và mọi trang khám phá. */
function publicSql(viewerId?: string): Prisma.Sql {
  return Prisma.sql`l.status = 'ACTIVE' AND l."deletedAt" IS NULL AND ${visibleUserSql(Prisma.sql`l."ownerId"`, viewerId)}`;
}

/** Tạo đúng truy vấn có giới hạn dùng trong production và kiểm chứng PostgreSQL EXPLAIN. */
export function discoveryStatement(
  query: DiscoveryQuery | PageQuery,
  cursor: DiscoveryCursor,
  viewerId?: string,
): Prisma.Sql {
  const filters: Prisma.Sql[] = [
    publicSql(viewerId),
    Prisma.sql`l."createdAt" <= ${new Date(cursor.asOf)}`,
  ];
  if (cursor.scope === "followed")
    filters.push(
      Prisma.sql`EXISTS (SELECT 1 FROM listing_follows f WHERE f."listingId" = l.id AND f."userId" = ${viewerId}::uuid)`,
    );
  if (cursor.scope.startsWith("user:"))
    filters.push(Prisma.sql`l."ownerId" = ${cursor.scope.slice(5)}::uuid`);
  if ("q" in query) {
    if (query.q)
      filters.push(Prisma.sql`l."searchTitle" LIKE ${titlePattern(query.q)} ESCAPE ${"\\"}`);
    if (query.type) filters.push(Prisma.sql`l.type = ${query.type}::"ListingType"`);
    if (query.rentalUnit)
      filters.push(Prisma.sql`l."rentalUnit" = ${query.rentalUnit}::"RentalUnit"`);
    if (query.provinceCode)
      filters.push(
        Prisma.sql`EXISTS (SELECT 1 FROM provinces p WHERE p.id = l."provinceId" AND p.code = ${query.provinceCode})`,
      );
    if (query.minPrice) filters.push(Prisma.sql`l.price >= ${query.minPrice}::numeric`);
    if (query.maxPrice) filters.push(Prisma.sql`l.price <= ${query.maxPrice}::numeric`);
    const window = postedWindow(query.postedWithin);
    if (window !== null)
      filters.push(Prisma.sql`l."createdAt" >= ${new Date(Date.parse(cursor.asOf) - window)}`);
  }
  const sort = "sort" in query ? query.sort : "NEWEST";
  const ascending = sort === "OLDEST" || sort === "PRICE_ASC" || sort === "RANDOM";
  const direction = ascending ? Prisma.sql`ASC` : Prisma.sql`DESC`;
  const operator = ascending ? Prisma.sql`>` : Prisma.sql`<`;
  const rank =
    sort === "RANDOM"
      ? Prisma.sql`md5(${cursor.seed}::text || ':' || lower(l.id::text)) COLLATE "C"`
      : Prisma.sql`NULL::text`;
  const key =
    sort === "RANDOM"
      ? rank
      : sort.startsWith("PRICE_")
        ? Prisma.sql`l.price`
        : Prisma.sql`l."createdAt"`;
  if (cursor.last) {
    const last = cursor.last;
    const boundary =
      "rank" in last
        ? Prisma.sql`${last.rank}::text COLLATE "C"`
        : "price" in last
          ? Prisma.sql`${last.price}::numeric`
          : Prisma.sql`${new Date(last.createdAt)}`;
    filters.push(Prisma.sql`(${key}, l.id) ${operator} (${boundary}, ${last.id}::uuid)`);
  }
  return Prisma.sql`SELECT l.id, l."createdAt", l.price, ${rank} AS rank FROM listings l
      WHERE ${Prisma.join(filters, " AND ")} ORDER BY ${key} ${direction}, l.id ${direction} LIMIT ${query.limit + 1}`;
}
export class ListingDiscoveryRepository {
  /** Chỉ chọn keyset có giới hạn trong PostgreSQL; mọi giá trị động đều là tham số bind. */
  candidates(
    query: DiscoveryQuery | PageQuery,
    cursor: DiscoveryCursor,
    viewerId: string | undefined,
    tx: DatabaseTransaction,
  ) {
    return tx.$queryRaw<DiscoveryCandidate[]>(discoveryStatement(query, cursor, viewerId));
  }

  /** Áp dụng lại điều kiện hiển thị khi nạp dữ liệu có giới hạn, ngăn ID cũ làm lộ dữ liệu ẩn/riêng tư. */
  async rows(
    ids: string[],
    viewerId: string | undefined,
    followed: boolean,
    tx: DatabaseTransaction,
  ) {
    return tx.listing.findMany({
      where: {
        id: { in: ids },
        status: "ACTIVE",
        deletedAt: null,
        owner: visibleUserWhere(viewerId),
        ...(followed ? { followers: { some: { userId: viewerId } } } : {}),
      },
      include: {
        ...listingProjection,
        followers: {
          where: viewerId ? { userId: viewerId } : { id: { in: [] } },
          select: { id: true },
        },
      },
    });
  }

  /** Chỉ trả trường autocomplete gọn nhẹ, không nạp thêm dữ liệu hay metadata nội bộ. */
  suggestions(q: string, viewerId: string | undefined, tx: DatabaseTransaction) {
    return tx.$queryRaw<Array<{ id: string; title: string }>>(
      Prisma.sql`SELECT l.id, l.title FROM listings l WHERE ${publicSql(viewerId)} AND l."searchTitle" LIKE ${titlePattern(q)} ESCAPE ${"\\"} ORDER BY l."createdAt" DESC, l.id DESC LIMIT 8`,
    );
  }
}
