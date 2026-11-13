import { raw, type RequestHandler } from "express";
import { AppError } from "../../shared/errors/app-error";
import { validateRequest } from "../../shared/middleware/validate-request";
import { z } from "zod";

export const listingUploadBytes = raw({ type: "application/octet-stream", limit: 100 * 1024 * 1024, inflate: false });
export const validateMediaId = validateRequest(z.object({ params: z.object({ mediaId: z.uuid() }), body: z.unknown(), query: z.unknown() }));
/** Requires one raw file rather than accepting client-provided storage metadata. */
export const requireListingBytes: RequestHandler = (request, _response, next) => {
  if (!Buffer.isBuffer(request.body) || !request.body.length) next(new AppError(415, "UNSUPPORTED_MEDIA", "Send file bytes as application/octet-stream.")); else next();
};
