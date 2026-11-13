import { Router } from "express";
import { authenticate, type SessionService } from "../auth";
import type { createAvatarController } from "./http/avatar.controller";
import { avatarBytes, requireAvatarBytes } from "./http/avatar.middleware";
import { validateUserId } from "./http/user.validation";

/** Connects authorized binary uploads without implementing Media or ownership rules in routes. */
export function createAvatarRouter(controller: ReturnType<typeof createAvatarController>, sessions: SessionService): Router {
  const router = Router();
  router.put("/users/me/avatar", authenticate(sessions), avatarBytes, requireAvatarBytes, controller.upload);
  router.delete("/users/me/avatar", authenticate(sessions), controller.remove);
  router.get("/users/:userId/avatar", authenticate(sessions, { optional: true }), validateUserId, controller.get);
  return router;
}
