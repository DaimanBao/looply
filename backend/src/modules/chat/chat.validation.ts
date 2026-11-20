import express from "express";
import { z } from "zod";
import { validateRequest } from "../../shared/middleware/validate-request";
import { chatId, chatPage, inboxQuery } from "./chat.schema";

export const chatParams = z.object({
  conversationId: chatId,
  messageId: chatId.optional(),
  mediaId: chatId.optional(),
  proposalId: chatId.optional(),
});
export const validateChatParams = validateRequest(
  z.object({ params: chatParams, body: z.unknown(), query: z.strictObject({}) }),
);
export const validateChatHistory = validateRequest(
  z.object({ params: chatParams, body: z.unknown(), query: chatPage }),
);
export const validateChatInbox = validateRequest(
  z.object({ params: z.unknown(), body: z.unknown(), query: inboxQuery }),
);
export const chatImageBytes = express.raw({
  type: "application/octet-stream",
  limit: 10 * 1024 * 1024,
});
