import { z } from "zod";
import { validateRequest } from "../../shared/middleware/validate-request";
import { notificationId, notificationPage } from "./notification.schema";

export const validateNotificationPage = validateRequest(
  z.object({ params: z.unknown(), body: z.unknown(), query: notificationPage }),
);
export const validateNotificationId = validateRequest(
  z.object({ params: z.object({ notificationId }), body: z.unknown(), query: z.strictObject({}) }),
);
