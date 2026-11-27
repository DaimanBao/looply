import type { ListingService } from "./listing.service";
import { principal } from "../auth";
import { parseRequest, validatedHandler } from "../../shared/middleware/validate-request";
import {
  createListingSchema,
  patchListingSchema,
  visibilitySchema,
  deleteListingSchema,
  listingId,
  myListingsSchema,
} from "./listing.schema";
import { z } from "zod";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { AppError } from "../../shared/errors/app-error";

/** Ánh xạ đầu vào HTTP đã kiểm tra sang thao tác domain; chính sách nằm trong service. */
export function createListingController(service: ListingService) {
  const byId = z.object({ params: z.object({ listingId }) });
  const patch = z.object({ body: patchListingSchema });
  const visibilityChange = z.object({ body: visibilitySchema });
  const deletion = z.object({ body: deleteListingSchema });
  /** Tạo và trả tài nguyên đã commit cùng Location chi tiết. */
  const create = validatedHandler(
    z.object({ body: createListingSchema }),
    async ({ body }, response) => {
      const result = await service.create(principal(response), body);
      response.location(`/api/listings/${result.id}`).status(201).json(result);
    },
  );
  /** Dùng danh tính tùy chọn, không chuyển credential sai thành truy cập khách. */
  const get = validatedHandler(byId, async ({ params }, response) => {
    response.json(await service.get(params.listingId, response.locals.principal));
  });
  /** Đọc giá trị phân trang đã chuyển đổi, không phân tích lại chuỗi đầu vào HTTP. */
  const mine = validatedHandler(
    z.object({ query: myListingsSchema }),
    async ({ query }, response) => {
      response.json(await service.mine(principal(response), query));
    },
  );
  /** Ủy quyền chỉnh sửa của chủ sở hữu chỉ với trường được phép đổi đã kiểm tra tường minh. */
  const update = validatedHandler(byId, async ({ params }, response, request) => {
    // Kiểm tra UUID trước body để giữ lỗi ưu tiên của endpoint quản lý.
    const { body } = parseRequest(patch, request);
    response.json(await service.update(params.listingId, principal(response), body));
  });
  /** Ủy quyền chuyển ẩn/mở lại bằng kiểm soát phiên bản lạc quan. */
  const visibility = validatedHandler(byId, async ({ params }, response, request) => {
    const { body } = parseRequest(visibilityChange, request);
    response.json(await service.visibility(params.listingId, principal(response), body));
  });
  /** Không trả body khi xóa kết thúc hoặc thử lại idempotent hợp lệ. */
  const remove = validatedHandler(byId, async ({ params }, response, request) => {
    const { body } = parseRequest(deletion, request);
    await service.remove(params.listingId, principal(response), body.expectedVersion);
    response.status(204).end();
  });
  /** Chỉ gửi byte riêng tư sau khi service hoàn tất phân quyền. */
  const delivery = validatedHandler(
    z.object({
      params: z.object({ listingId, mediaId: listingId }),
      query: z.strictObject({ variant: z.enum(["detail", "thumbnail", "original"]).optional() }),
    }),
    async ({ params, query }, response, request) => {
      const result = await service.delivery(
        {
          ...params,
          variant: query.variant,
          range: request.method === "HEAD" ? undefined : request.headers.range,
          ifRange: request.headers["if-range"] !== undefined,
        },
        response.locals.principal,
      );
      if (result.body instanceof Readable && (result.body.destroyed || result.body.errored))
        throw new AppError(503, "MEDIA_UNAVAILABLE", "Media is temporarily unavailable.");
      response.set("Accept-Ranges", result.acceptRanges);
      if (result.contentRange) response.set("Content-Range", result.contentRange);
      if (result.status === 416)
        throw new AppError(416, "INVALID_RANGE", "Choose a satisfiable single byte range.");
      response
        .status(result.status)
        .type(result.mimeType)
        .set("Content-Length", String(result.length));
      if (request.method === "HEAD") {
        if (result.body instanceof Readable) result.body.destroy();
        response.end();
        return;
      }
      if (result.body instanceof Readable) {
        // Không giữ khóa database khi phát; storage bất biến bảo toàn luồng byte đã mở.
        const timer = setTimeout(() => {
          if (result.body instanceof Readable) result.body.destroy();
          response.destroy();
        }, 120000);
        try {
          await pipeline(result.body, response);
        } catch {
          response.destroy();
        } finally {
          clearTimeout(timer);
        }
      } else response.send(result.body);
    },
  );
  return { create, get, mine, update, visibility, remove, delivery };
}
