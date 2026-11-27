import { z } from "zod";
import { principal } from "../auth";
import { validatedHandler } from "../../shared/middleware/validate-request";
import type { ListingDiscoveryService } from "./listing-discovery.service";
import type { ListingFollowService } from "./listing-follow.service";
import {
  discoveryQuerySchema,
  pageQuerySchema,
  suggestionsSchema,
} from "./listing-discovery.schema";
import { listingId } from "./listing.schema";

/** Nối HTTP với service khám phá và quan hệ; validation và phân quyền vẫn tách riêng. */
export function createListingDiscoveryController(
  discovery: ListingDiscoveryService,
  follows: ListingFollowService,
) {
  const listingParams = z.object({ params: z.object({ listingId }) });
  /** Trả trang tìm kiếm/lân cận/toàn quốc được yêu cầu mà không đoán vị trí hồ sơ. */
  const search = validatedHandler(
    z.object({ query: discoveryQuerySchema }),
    async ({ query }, response) => {
      response.json(await discovery.page(query, "discovery", response.locals.principal));
    },
  );
  /** Chỉ trả kết quả khớp tiêu đề gọn nhẹ. */
  const suggestions = validatedHandler(
    z.object({ query: suggestionsSchema }),
    async ({ query }, response) => {
      response.json(await discovery.suggestions(query.q, response.locals.principal));
    },
  );
  /** Dùng thứ tự tạo Listing thay vì thứ tự tạo quan hệ cho trang đang theo dõi. */
  const followed = validatedHandler(
    z.object({ query: pageQuerySchema }),
    async ({ query }, response) => {
      response.json(await discovery.page(query, "followed", principal(response)));
    },
  );
  /** Giới hạn trang người dùng công khai theo đúng đối tượng và không trả bài HIDDEN. */
  const userListings = validatedHandler(
    z.object({ params: z.object({ userId: listingId }), query: pageQuerySchema }),
    async ({ params, query }, response) => {
      response.json(
        await discovery.page(query, `user:${params.userId}`, response.locals.principal),
      );
    },
  );
  /** PUT giữ nguyên không có body và idempotent với Listing đủ điều kiện. */
  const follow = validatedHandler(listingParams, async ({ params }, response) => {
    await follows.follow(params.listingId, principal(response));
    response.status(204).end();
  });
  /** DELETE không tiết lộ sự tồn tại hoặc quyền hiển thị của dữ liệu người khác. */
  const unfollow = validatedHandler(listingParams, async ({ params }, response) => {
    await follows.unfollow(params.listingId, principal(response));
    response.status(204).end();
  });
  return { search, suggestions, followed, userListings, follow, unfollow };
}
