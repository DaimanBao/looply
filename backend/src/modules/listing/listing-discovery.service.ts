import type { Principal, SessionService } from "../auth";
import { AppError } from "../../shared/errors/app-error";
import { ListingRepository } from "./listing.repository";
import { listingItem } from "./listing.dto";
import {
  ListingDiscoveryRepository,
  type DiscoveryCandidate,
} from "./listing-discovery.repository";
import {
  decodeDiscoveryCursor,
  encodeDiscoveryCursor,
  type DiscoveryScope,
  type PageBoundary,
} from "./listing-discovery-cursor";
import type { DiscoveryQuery, PageQuery } from "./listing-discovery.schema";

export class ListingDiscoveryService {
  /** Tái sử dụng vòng đời/đồng hồ Listing và quyền phiên Auth, tách riêng lưu trữ truy vấn. */
  constructor(
    private readonly listings: ListingRepository,
    private readonly repository: ListingDiscoveryRepository,
    private readonly sessions: SessionService,
  ) {}

  /** Tạo trang khám phá, người dùng công khai hoặc đang theo dõi với điều kiện hiển thị hiện thời ở mỗi yêu cầu. */
  async page(query: DiscoveryQuery | PageQuery, scope: DiscoveryScope, viewer?: Principal) {
    return this.listings.transaction(async (tx) => {
      if (viewer) {
        await this.listings.lockUsers([viewer.userId], tx);
        await this.sessions.requireCurrent(viewer, tx);
      }
      if (scope === "followed" && !viewer)
        throw new AppError(401, "UNAUTHORIZED", "Authentication required.");
      if (
        scope.startsWith("user:") &&
        !(await this.listings.visibleOwner(scope.slice(5), viewer?.userId, tx))
      )
        throw new AppError(404, "NOT_FOUND", "User not found.");
      const cursor = decodeDiscoveryCursor(
        query,
        scope,
        viewer?.userId ?? null,
        await this.listings.now(tx),
      );
      const candidates = await this.repository.candidates(query, cursor, viewer?.userId, tx);
      const rows = await this.repository.rows(
        candidates.map((row) => row.id),
        viewer?.userId,
        scope === "followed",
        tx,
      );
      const byId = new Map(rows.map((row) => [row.id, row]));
      const visible = candidates.filter((row) => byId.has(row.id));
      const page = visible.slice(0, query.limit);
      const last = page.at(-1);
      return {
        data: page.map((candidate) => {
          const row = byId.get(candidate.id)!;
          return listingItem(row, row.followers.length > 0);
        }),
        pagination: {
          nextCursor:
            visible.length > query.limit && last
              ? encodeDiscoveryCursor(
                  cursor,
                  boundary(last, "sort" in query ? query.sort : "NEWEST"),
                )
              : null,
        },
      };
    });
  }

  /** Truy vấn rỗng không tra Listings; credential tùy chọn vẫn phải qua kiểm tra tài khoản hoạt động. */
  async suggestions(q: string, viewer?: Principal) {
    return this.listings.transaction(async (tx) => {
      if (viewer) {
        await this.listings.lockUsers([viewer.userId], tx);
        await this.sessions.requireCurrent(viewer, tx);
      }
      return { data: q ? await this.repository.suggestions(q, viewer?.userId, tx) : [] };
    });
  }
}
/** Dùng giá trị sắp xếp đã chọn bởi SQL thay vì hàng có thể bị đổi đồng thời sau đó. */
function boundary(row: DiscoveryCandidate, sort: DiscoveryQuery["sort"]): PageBoundary {
  if (sort === "RANDOM") {
    if (!row.rank) throw new Error("Missing feed rank");
    return { id: row.id, rank: row.rank };
  }
  if (sort.startsWith("PRICE_")) {
    if (!row.price) throw new Error("Missing comparable price");
    return { id: row.id, price: row.price.toFixed(0) };
  }
  return { id: row.id, createdAt: row.createdAt.toISOString() };
}
