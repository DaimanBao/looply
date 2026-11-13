import { raw } from "express";
import type { RequestHandler } from "express";
import { AppError } from "../../../shared/errors/app-error";

export const avatarBytes = raw({ type: "application/octet-stream", limit: 10 * 1024 * 1024 });
/** Rejects JSON, filenames and client-reported MIME as a substitute for actual image bytes. */
export const requireAvatarBytes: RequestHandler = (request, _response, next) => {
  if (!Buffer.isBuffer(request.body)) next(new AppError(400, "INVALID_AVATAR", "Send image bytes as application/octet-stream.")); else next();
};
