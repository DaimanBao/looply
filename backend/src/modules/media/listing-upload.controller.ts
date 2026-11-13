import type { RequestHandler } from "express";
import { principal } from "../auth";
import { z } from "zod";
import type { ListingUploadService } from "./listing-upload.service";

/** Maps the raw upload/cancellation transport without exposing storage keys. */
export function createListingUploadController(service: ListingUploadService) {
  /** Returns a ready TEMP descriptor after server processing and final session validation. */
  const upload: RequestHandler = async (_request, response) => {
    const stage = z.object({ path: z.string(), signal: z.instanceof(AbortSignal), release: z.custom<() => Promise<void>>((value) => typeof value === "function") }).parse(response.locals.stagedUpload);
    try { const result = await service.uploadFile(principal(response), stage.path, stage.signal); await stage.release(); response.status(201).json(result); }
    finally { await stage.release(); }
  };
  /** Identifies cancellation by asset UUID and the authenticated uploader only. */
  const cancel: RequestHandler = async (request, response) => { await service.cancel(principal(response), z.uuid().parse(request.params.mediaId).toLowerCase()); response.status(204).end(); };
  return { upload, cancel };
}
