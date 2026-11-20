import type { PrismaClient } from "../../generated/prisma/client";
import type { SessionService } from "../auth";
import { ConversationPresence } from "./conversation-presence";
import { NotificationEvents } from "./notification.events";
import { NotificationRepository } from "./notification.repository";
import { NotificationOutboxRepository } from "./notification-outbox.repository";
import { NotificationService } from "./notification.service";
import { NotificationWorker } from "./notification.worker";
import { createNotificationController } from "./notification.controller";
import { createNotificationRouter } from "./notification.routes";

/** Lắp ghép module và chỉ công khai các cổng integration cần thiết. */
export function createNotificationModule(db: PrismaClient, sessions: SessionService) {
  const events = new NotificationEvents();
  const presence = new ConversationPresence();
  const service = new NotificationService(new NotificationRepository(db), sessions, events);
  const worker = new NotificationWorker(new NotificationOutboxRepository(db), events);
  return {
    service,
    events,
    presence,
    worker,
    router: createNotificationRouter(createNotificationController(service), sessions),
  };
}
