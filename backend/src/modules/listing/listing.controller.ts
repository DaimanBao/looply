import type { RequestHandler } from "express";
import type { ListingService } from "./listing.service";
import { principal } from "../auth";
import { body } from "../../shared/http/validated-body";
import {
  createListingSchema,
  patchListingSchema,
  visibilitySchema,
  deleteListingSchema,
  listingId,
  myListingsInput,
} from "./listing.schema";
import { z } from "zod";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { AppError } from "../../shared/errors/app-error";

/** Ánh xạ đầu vào HTTP đã kiểm tra sang thao tác domain; chính sách nằm trong service. */
export function createListingController(service: ListingService) {
  /** Tạo và trả tài nguyên đã commit cùng Location chi tiết. */
  const create: RequestHandler = async (_request, response) => {
    const result = await service.create(principal(response), body(response, createListingSchema));
    response.location(`/api/listings/${result.id}`).status(201).json(result);
  };
  /** Dùng danh tính tùy chọn, không chuyển credential sai thành truy cập khách. */
  const get: RequestHandler = async (request, response) => {
    response.json(
      await service.get(listingId.parse(request.params.listingId), response.locals.principal),
    );
  };
  /** Đọc giá trị phân trang đã chuyển đổi, không phân tích lại chuỗi đầu vào HTTP. */
  const mine: RequestHandler = async (_request, response) => {
    const input = z.object({ query: myListingsInput }).parse(response.locals.validated);
    response.json(await service.mine(principal(response), input.query));
  };
  /** Ủy quyền chỉnh sửa của chủ sở hữu chỉ với trường được phép đổi đã kiểm tra tường minh. */
  const update: RequestHandler = async (request, response) => {
    response.json(
      await service.update(
        listingId.parse(request.params.listingId),
        principal(response),
        body(response, patchListingSchema),
      ),
    );
  };
  /** Ủy quyền chuyển ẩn/mở lại bằng kiểm soát phiên bản lạc quan. */
  const visibility: RequestHandler = async (request, response) => {
    response.json(
      await service.visibility(
        listingId.parse(request.params.listingId),
        principal(response),
        body(response, visibilitySchema),
      ),
    );
  };
  /** Không trả body khi xóa kết thúc hoặc thử lại idempotent hợp lệ. */
  const remove: RequestHandler = async (request, response) => {
    await service.remove(
      listingId.parse(request.params.listingId),
      principal(response),
      body(response, deleteListingSchema).expectedVersion,
    );
    response.status(204).end();
  };
  /** Chỉ gửi byte riêng tư sau khi service hoàn tất phân quyền. */
  const delivery: RequestHandler = async (request, response) => {
    const input = z
      .object({
        params: z.object({ listingId, mediaId: listingId }),
        query: z.object({ variant: z.enum(["detail", "thumbnail", "original"]).optional() }),
      })
      .parse(response.locals.validated);
    const result = await service.delivery(
      {
        ...input.params,
        variant: input.query.variant,
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
  };
  return { create, get, mine, update, visibility, remove, delivery };
}
