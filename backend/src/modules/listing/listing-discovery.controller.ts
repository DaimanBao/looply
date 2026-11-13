import type { RequestHandler } from "express";
import { z } from "zod";
import { principal } from "../auth";
import type { ListingDiscoveryService } from "./listing-discovery.service";
import type { ListingFollowService } from "./listing-follow.service";
import {
  discoveryValuesSchema,
  pageValuesSchema,
  suggestionsSchema,
} from "./listing-discovery.schema";
import { listingId } from "./listing.schema";

/** Nối HTTP với service khám phá và quan hệ; validation và phân quyền vẫn tách riêng. */
export function createListingDiscoveryController(
  discovery: ListingDiscoveryService,
  follows: ListingFollowService,
) {
  /** Trả trang tìm kiếm/lân cận/toàn quốc được yêu cầu mà không đoán vị trí hồ sơ. */
  const search: RequestHandler = async (_request, response) => {
    const input = z.object({ query: discoveryValuesSchema }).parse(response.locals.validated);
    response.json(await discovery.page(input.query, "discovery", response.locals.principal));
  };
  /** Chỉ trả kết quả khớp tiêu đề gọn nhẹ. */
  const suggestions: RequestHandler = async (_request, response) => {
    const input = z.object({ query: suggestionsSchema }).parse(response.locals.validated);
    response.json(await discovery.suggestions(input.query.q, response.locals.principal));
  };
  /** Dùng thứ tự tạo Listing thay vì thứ tự tạo quan hệ cho trang đang theo dõi. */
  const followed: RequestHandler = async (_request, response) => {
    const input = z.object({ query: pageValuesSchema }).parse(response.locals.validated);
    response.json(await discovery.page(input.query, "followed", principal(response)));
  };
  /** Giới hạn trang người dùng công khai theo đúng đối tượng và không trả bài HIDDEN. */
  const userListings: RequestHandler = async (_request, response) => {
    const input = z
      .object({ params: z.object({ userId: listingId }), query: pageValuesSchema })
      .parse(response.locals.validated);
    response.json(
      await discovery.page(input.query, `user:${input.params.userId}`, response.locals.principal),
    );
  };
  /** PUT giữ nguyên không có body và idempotent với Listing đủ điều kiện. */
  const follow: RequestHandler = async (request, response) => {
    await follows.follow(listingId.parse(request.params.listingId), principal(response));
    response.status(204).end();
  };
  /** DELETE không tiết lộ sự tồn tại hoặc quyền hiển thị của dữ liệu người khác. */
  const unfollow: RequestHandler = async (request, response) => {
    await follows.unfollow(listingId.parse(request.params.listingId), principal(response));
    response.status(204).end();
  };
  return { search, suggestions, followed, userListings, follow, unfollow };
}
