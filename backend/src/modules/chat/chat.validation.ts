import express from "express";
import { z } from "zod";
import { validateRequest } from "../../shared/middleware/validate-request";
import { chatId } from "./chat.schema";

export const validateChatParams = validateRequest(
  z.object({ params: z.object({ conversationId: chatId }), query: z.strictObject({}) }),
);
export const chatImageBytes = express.raw({
  type: "application/octet-stream",
  limit: 10 * 1024 * 1024,
});
