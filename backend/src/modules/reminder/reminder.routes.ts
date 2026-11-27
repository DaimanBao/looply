import { Router } from "express";
import { authenticate, type SessionService } from "../auth";
import { noStore } from "../../shared/middleware/no-store";
import type { createReminderController } from "./reminder.controller";

/** Chỉ nối middleware và controller; cả hai route yêu cầu tài khoản ACTIVE. */
export function createReminderRouter(
  controller: ReturnType<typeof createReminderController>,
  sessions: SessionService,
): Router {
  const router = Router();
  router.use("/reminders", noStore, authenticate(sessions));
  router.get("/reminders", controller.evaluate);
  router.post("/reminders/presentation", controller.present);
  return router;
}
