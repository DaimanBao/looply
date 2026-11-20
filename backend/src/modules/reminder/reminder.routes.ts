import { Router } from "express";
import { authenticate, type SessionService } from "../auth";
import { noStore } from "../../shared/middleware/no-store";
import { validateBody } from "../../shared/middleware/validate-request";
import type { createReminderController } from "./reminder.controller";
import { presentationBody } from "./reminder.schema";

/** Chỉ nối middleware và controller; cả hai route yêu cầu tài khoản ACTIVE. */
export function createReminderRouter(
  controller: ReturnType<typeof createReminderController>,
  sessions: SessionService,
): Router {
  const router = Router();
  router.use("/reminders", noStore, authenticate(sessions));
  router.get("/reminders", controller.evaluate);
  router.post("/reminders/presentation", validateBody(presentationBody), controller.present);
  return router;
}
