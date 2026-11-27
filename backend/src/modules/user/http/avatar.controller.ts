import type { RequestHandler } from "express";
import { z } from "zod";
import { userIdSchema } from "../user.schema";
import type { AvatarService } from "../avatar.service";
import { principal } from "../../auth";
import { AppError } from "../../../shared/errors/app-error";
import { validatedHandler } from "../../../shared/middleware/validate-request";

/** Xử lý HTTP nhị phân; validation, sở hữu và đính kèm nằm trong service Media/User. */
export function createAvatarController(avatars: AvatarService) {
  /** Chuyển byte nhị phân thực vào pipeline avatar có kiểm tra. */
  const upload: RequestHandler = async (request, response) => {
    if (!Buffer.isBuffer(request.body))
      throw new AppError(400, "INVALID_AVATAR", "Send image bytes.");
    response.json(await avatars.upload(principal(response), request.body));
  };
  /** Tách avatar hiện tại trước cleanup nền. */
  const remove: RequestHandler = async (_request, response) => {
    await avatars.remove(principal(response));
    response.sendStatus(204);
  };
  /** Chỉ phục vụ byte avatar có phân quyền, không cung cấp URL storage. */
  const get = validatedHandler(z.object({ params: userIdSchema }), async ({ params }, response) => {
    const avatar = await avatars.get(params.userId, response.locals.principal);
    response.setHeader("Cache-Control", "private, no-store");
    response.type(avatar.mimeType).send(avatar.bytes);
  });
  return { upload, remove, get };
}
