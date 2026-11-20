import { Router } from "express";
import { authenticate, type SessionService } from "../auth";
import { noStore } from "../../shared/middleware/no-store";
import { validateBody } from "../../shared/middleware/validate-request";
import type { createNotificationController } from "./notification.controller";
import { notificationRead, notificationReadAll } from "./notification.schema";
import { validateNotificationId, validateNotificationPage } from "./notification.validation";

/** Route chỉ kết nối middleware và handler được import. */
export function createNotificationRouter(
  controller: ReturnType<typeof createNotificationController>,
  sessions: SessionService,
): Router {
  const router = Router();
  router.use("/notifications", noStore, authenticate(sessions));
  router.get("/notifications", validateNotificationPage, controller.list);
  router.get("/notifications/unread-count", controller.count);
  router.put("/notifications/read-all", validateBody(notificationReadAll), controller.readAll);
  router.put(
    "/notifications/:notificationId/read",
    validateNotificationId,
    validateBody(notificationRead),
    controller.read,
  );
  router.delete("/notifications/:notificationId", validateNotificationId, controller.remove);
  router.get("/notifications/:notificationId/target", validateNotificationId, controller.target);
  return router;
}
