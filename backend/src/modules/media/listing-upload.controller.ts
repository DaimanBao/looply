import type { RequestHandler } from "express";
import { principal } from "../auth";
import { z } from "zod";
import type { ListingUploadService } from "./listing-upload.service";

/** Ánh xạ giao thức upload thô/hủy mà không tiết lộ storage key. */
export function createListingUploadController(service: ListingUploadService) {
  /** Trả mô tả TEMP sẵn sàng sau xử lý server và kiểm tra phiên cuối. */
  const upload: RequestHandler = async (_request, response) => {
    const stage = z
      .object({
        path: z.string(),
        signal: z.instanceof(AbortSignal),
        release: z.custom<() => Promise<void>>((value) => typeof value === "function"),
      })
      .parse(response.locals.stagedUpload);
    try {
      const result = await service.uploadFile(principal(response), stage.path, stage.signal);
      await stage.release();
      response.status(201).json(result);
    } finally {
      await stage.release();
    }
  };
  /** Xác định hủy chỉ bằng UUID tài nguyên và người upload đã xác thực. */
  const cancel: RequestHandler = async (request, response) => {
    await service.cancel(principal(response), z.uuid().parse(request.params.mediaId).toLowerCase());
    response.status(204).end();
  };
  return { upload, cancel };
}
