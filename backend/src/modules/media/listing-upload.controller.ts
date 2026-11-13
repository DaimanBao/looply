import type { RequestHandler } from "express";
import { principal } from "../auth";
import { z } from "zod";
import type { ListingUploadService } from "./listing-upload.service";

/** Maps the raw upload/cancellation transport without exposing storage keys. */
export function createListingUploadController(service: ListingUploadService) {
  /** Returns a ready TEMP descriptor after server processing and final session validation. */
  const upload: RequestHandler = async (request, response) => { response.status(201).json(await service.upload(principal(response), z.instanceof(Buffer).parse(request.body))); };
  /** Identifies cancellation by asset UUID and the authenticated uploader only. */
  const cancel: RequestHandler = async (request, response) => { await service.cancel(principal(response), z.uuid().parse(request.params.mediaId).toLowerCase()); response.status(204).end(); };
  return { upload, cancel };
}
