import { Router } from "express";
import { authenticate, type SessionService } from "../auth";
import { noStore } from "../../shared/middleware/no-store";
import type { createChatController } from "./chat.controller";
import { chatImageBytes, validateChatParams } from "./chat.validation";

/** Route chỉ nối authentication/validation/controller, không chứa nghiệp vụ. */
export function createChatRouter(
  controller: ReturnType<typeof createChatController>,
  sessions: SessionService,
): Router {
  const router = Router();
  router.use("/conversations", noStore, authenticate(sessions));
  router.post("/conversations", controller.create);
  router.get("/conversations", controller.inbox);
  router.get("/conversations/:conversationId", controller.get);
  router.delete("/conversations/:conversationId", controller.hide);
  router.get("/conversations/:conversationId/messages", controller.history);
  router.post("/conversations/:conversationId/messages", controller.send);
  router.put("/conversations/:conversationId/read", controller.read);
  router.put("/conversations/:conversationId/delivered", controller.delivered);
  router.post("/conversations/:conversationId/proposals", controller.propose);
  router.patch("/conversations/:conversationId/proposals/:proposalId", controller.resolve);
  router.post(
    "/conversations/:conversationId/images",
    validateChatParams,
    chatImageBytes,
    controller.upload,
  );
  router.delete("/conversations/:conversationId/images/:mediaId", controller.cancel);
  router.get("/conversations/:conversationId/messages/:messageId/image", controller.image);
  router.get("/conversations/:conversationId/messages/:messageId/snapshot", controller.snapshot);
  return router;
}
