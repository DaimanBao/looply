import { Router } from "express";
import { authenticate, type SessionService } from "../auth";
import { noStore } from "../../shared/middleware/no-store";
import type { createNotificationController } from "./notification.controller";

/** Route chỉ kết nối middleware và handler được import. */
export function createNotificationRouter(
  controller: ReturnType<typeof createNotificationController>,
  sessions: SessionService,
): Router {
  const router = Router();
  router.use("/notifications", noStore, authenticate(sessions));
  router.get("/notifications", controller.list);
  router.get("/notifications/unread-count", controller.count);
  router.put("/notifications/read-all", controller.readAll);
  router.put("/notifications/:notificationId/read", controller.read);
  router.delete("/notifications/:notificationId", controller.remove);
  router.get("/notifications/:notificationId/target", controller.target);
  return router;
}
