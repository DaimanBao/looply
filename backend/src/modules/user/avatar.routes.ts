import { Router } from "express";
import { authenticate, type SessionService } from "../auth";
import type { createAvatarController } from "./http/avatar.controller";
import { avatarBytes, requireAvatarBytes } from "./http/avatar.middleware";

/** Nối upload nhị phân có phân quyền mà không triển khai quy tắc Media hoặc sở hữu trong route. */
export function createAvatarRouter(
  controller: ReturnType<typeof createAvatarController>,
  sessions: SessionService,
): Router {
  const router = Router();
  router.put(
    "/users/me/avatar",
    authenticate(sessions),
    avatarBytes,
    requireAvatarBytes,
    controller.upload,
  );
  router.delete("/users/me/avatar", authenticate(sessions), controller.remove);
  router.get("/users/:userId/avatar", authenticate(sessions, { optional: true }), controller.get);
  return router;
}
