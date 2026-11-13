import { Router } from "express";
import type { SessionService } from "../auth";
import { authenticate } from "../auth";
import { validateBody } from "../../shared/middleware/validate-request";
import { noStore } from "../../shared/middleware/no-store";
import type { createUserController } from "./http/user.controller";
import { validateUserId, validatePage } from "./http/user.validation";
import { profileSchema, changeUsernameSchema } from "./user.schema";
import { changeContactSchema, changePasswordSchema } from "../auth";

/** Connects User endpoints to imported authorization, validation and controller functions. */
export function createUserRouter(controller: ReturnType<typeof createUserController>, sessions: SessionService): Router {
  const router = Router(); const active = authenticate(sessions); const optional = authenticate(sessions, { optional: true });
  router.use("/users", noStore);
  router.get("/provinces", controller.provinces);
  router.get("/users/me", authenticate(sessions, { pending: true }), controller.me);
  router.patch("/users/me", active, validateBody(profileSchema), controller.update);
  router.patch("/users/me/username", active, validateBody(changeUsernameSchema), controller.username);
  router.patch("/users/me/email", active, validateBody(changeContactSchema), controller.email);
  router.patch("/users/me/phone", active, validateBody(changeContactSchema), controller.phone);
  router.patch("/users/me/password", active, validateBody(changePasswordSchema), controller.password);
  router.get("/users/me/blocked", active, validatePage, controller.blocked);
  router.get("/users/:userId", optional, validateUserId, controller.profile);
  router.get("/users/:userId/followers", optional, validateUserId, validatePage, controller.followers);
  router.get("/users/:userId/following", optional, validateUserId, validatePage, controller.following);
  router.put("/users/:userId/follow", active, validateUserId, controller.follow);
  router.delete("/users/:userId/follow", active, validateUserId, controller.unfollow);
  router.put("/users/:userId/block", active, validateUserId, controller.block);
  router.delete("/users/:userId/block", active, validateUserId, controller.unblock);
  return router;
}
