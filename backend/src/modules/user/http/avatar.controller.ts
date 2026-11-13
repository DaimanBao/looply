import type { RequestHandler } from "express";
import { userIdSchema } from "../user.schema";
import type { AvatarService } from "../avatar.service";
import { principal } from "../../auth";
import { AppError } from "../../../shared/errors/app-error";

/** Handles binary HTTP transport while validation, ownership and attachment stay in Media/User services. */
export function createAvatarController(avatars: AvatarService) {
  /** Passes actual binary bytes to the validated avatar pipeline. */
  const upload: RequestHandler = async (request, response) => {
    if (!Buffer.isBuffer(request.body)) throw new AppError(400, "INVALID_AVATAR", "Send image bytes.");
    response.json(await avatars.upload(principal(response), request.body));
  };
  /** Detaches the current avatar before background cleanup. */
  const remove: RequestHandler = async (_request, response) => { await avatars.remove(principal(response)); response.sendStatus(204); };
  /** Serves only authorized avatar bytes without a storage URL. */
  const get: RequestHandler = async (request, response) => {
    const avatar = await avatars.get(userIdSchema.parse(request.params).userId, response.locals.principal);
    response.setHeader("Cache-Control", "private, no-store"); response.type(avatar.mimeType).send(avatar.bytes);
  };
  return { upload, remove, get };
}
