import { Router } from "express";
import { authenticate, type SessionService } from "../auth";
import { noStore } from "../../shared/middleware/no-store";
import { validateBody } from "../../shared/middleware/validate-request";
import type { createChatController } from "./chat.controller";
import {
  conversationInput,
  messageInput,
  proposalInput,
  receiptInput,
  resolveInput,
} from "./chat.schema";
import {
  chatImageBytes,
  validateChatHistory,
  validateChatInbox,
  validateChatParams,
} from "./chat.validation";

/** Route chỉ nối authentication/validation/controller, không chứa nghiệp vụ. */
export function createChatRouter(
  controller: ReturnType<typeof createChatController>,
  sessions: SessionService,
): Router {
  const router = Router();
  router.use("/conversations", noStore, authenticate(sessions));
  router.post("/conversations", validateBody(conversationInput), controller.create);
  router.get("/conversations", validateChatInbox, controller.inbox);
  router.get("/conversations/:conversationId", validateChatParams, controller.get);
  router.delete("/conversations/:conversationId", validateChatParams, controller.hide);
  router.get("/conversations/:conversationId/messages", validateChatHistory, controller.history);
  router.post(
    "/conversations/:conversationId/messages",
    validateChatParams,
    validateBody(messageInput),
    controller.send,
  );
  router.put(
    "/conversations/:conversationId/read",
    validateChatParams,
    validateBody(receiptInput),
    controller.read,
  );
  router.put(
    "/conversations/:conversationId/delivered",
    validateChatParams,
    validateBody(receiptInput),
    controller.delivered,
  );
  router.post(
    "/conversations/:conversationId/proposals",
    validateChatParams,
    validateBody(proposalInput),
    controller.propose,
  );
  router.patch(
    "/conversations/:conversationId/proposals/:proposalId",
    validateChatParams,
    validateBody(resolveInput),
    controller.resolve,
  );
  router.post(
    "/conversations/:conversationId/images",
    validateChatParams,
    chatImageBytes,
    controller.upload,
  );
  router.delete(
    "/conversations/:conversationId/images/:mediaId",
    validateChatParams,
    controller.cancel,
  );
  router.get(
    "/conversations/:conversationId/messages/:messageId/image",
    validateChatParams,
    controller.image,
  );
  router.get(
    "/conversations/:conversationId/messages/:messageId/snapshot",
    validateChatParams,
    controller.snapshot,
  );
  return router;
}
