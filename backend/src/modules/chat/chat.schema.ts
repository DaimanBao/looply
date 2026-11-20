import { z } from "zod";

export const chatId = z.uuid().transform((value) => value.toLowerCase());
export const conversationInput = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("LISTING"), listingId: chatId }),
  z.strictObject({ type: z.literal("DIRECT"), userId: chatId }),
]);
export const messageInput = z
  .strictObject({
    requestId: chatId,
    content: z
      .string()
      .refine(
        (value) =>
          !value.includes("\u0000") && Buffer.from(value, "utf8").toString("utf8") === value,
        "Invalid Unicode text",
      )
      .transform((value) => value.trim())
      .refine((value) => [...value].length >= 1 && [...value].length <= 5000)
      .optional(),
    imageMediaId: chatId.optional(),
  })
  .refine((value) => !!value.content || !!value.imageMediaId);
export const proposalInput = z
  .strictObject({
    requestId: chatId,
    kind: z.enum(["LISTED_PRICE", "NEGOTIATED_PRICE", "EXCHANGE_CONTACT"]),
    proposedPrice: z
      .string()
      .regex(/^[1-9][0-9]{0,14}$/)
      .optional(),
  })
  .refine((value) =>
    value.kind === "NEGOTIATED_PRICE" ? !!value.proposedPrice : value.proposedPrice === undefined,
  );
export const receiptInput = z.strictObject({ messageId: chatId });
export const resolveInput = z.strictObject({ status: z.enum(["ACCEPTED", "REJECTED"]) });
export const chatPage = z.strictObject({
  after: z.string().min(1).max(1024).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(30),
});
export const inboxQuery = chatPage.extend({
  group: z.enum(["DIRECT", "LISTING"]).optional(),
  listingId: chatId.optional(),
});
export type MessageInput = z.infer<typeof messageInput>;
export type ProposalInput = z.infer<typeof proposalInput>;
export type ChatPage = z.infer<typeof chatPage>;
