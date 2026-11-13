import { raw } from "express";
import type { RequestHandler } from "express";
import { AppError } from "../../../shared/errors/app-error";

export const avatarBytes = raw({ type: "application/octet-stream", limit: 10 * 1024 * 1024 });
/** Từ chối JSON, tên file và MIME client khai báo thay cho byte ảnh thực. */
export const requireAvatarBytes: RequestHandler = (request, _response, next) => {
  if (!Buffer.isBuffer(request.body))
    next(new AppError(400, "INVALID_AVATAR", "Send image bytes as application/octet-stream."));
  else next();
};
