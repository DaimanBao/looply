import { Router } from "express";
import type { SessionService } from "../auth";
import { authenticate } from "../auth";
import { noStore } from "../../shared/middleware/no-store";
import type { createUserController } from "./http/user.controller";

/** Nối endpoint User với các hàm phân quyền, validation và controller được import. */
export function createUserRouter(
  controller: ReturnType<typeof createUserController>,
  sessions: SessionService,
): Router {
  const router = Router();
  const active = authenticate(sessions);
  const optional = authenticate(sessions, { optional: true });
  router.use("/users", noStore);
  router.get("/provinces", controller.provinces);
  router.get("/users/me", authenticate(sessions, { pending: true }), controller.me);
  router.patch("/users/me", active, controller.update);
  router.patch("/users/me/username", active, controller.username);
  router.patch("/users/me/email", active, controller.email);
  router.patch("/users/me/phone", active, controller.phone);
  router.patch("/users/me/password", active, controller.password);
  router.get("/users/me/blocked", active, controller.blocked);
  router.get("/users/:userId", optional, controller.profile);
  router.get("/users/:userId/followers", optional, controller.followers);
  router.get("/users/:userId/following", optional, controller.following);
  router.put("/users/:userId/follow", active, controller.follow);
  router.delete("/users/:userId/follow", active, controller.unfollow);
  router.put("/users/:userId/block", active, controller.block);
  router.delete("/users/:userId/block", active, controller.unblock);
  return router;
}
