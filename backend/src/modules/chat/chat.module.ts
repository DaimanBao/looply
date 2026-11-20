import type { PrismaClient } from "../../generated/prisma/client";
import type { SessionService } from "../auth";
import { ChatMediaService, ChatMediaRepository, type ObjectStore } from "../media";
import { ChatRepository } from "./chat.repository";
import { ChatAccess } from "./chat-access";
import { ChatEvents } from "./chat-events";
import { ChatRetention } from "./chat-retention.service";
import { ConversationService } from "./conversation.service";
import { MessageService } from "./message.service";
import { ProposalService } from "./proposal.service";
import { createChatController } from "./chat.controller";
import { createChatRouter } from "./chat.routes";

/** Công khai composition của Chat, tránh consumer phụ thuộc repository nội bộ. */
export function createChatModule(
  db: PrismaClient,
  sessions: SessionService,
  storage: ObjectStore,
  isViewing: (userId: string, conversationId: string) => boolean | Promise<boolean> = () => false,
) {
  const repository = new ChatRepository(db);
  const access = new ChatAccess(repository, sessions);
  const media = new ChatMediaService(new ChatMediaRepository(db), storage);
  const events = new ChatEvents();
  const retention = new ChatRetention(repository, media);
  const conversations = new ConversationService(access);
  const messages = new MessageService(access, media, retention, events, isViewing);
  const proposals = new ProposalService(access, media, retention, events);
  return {
    conversations,
    messages,
    proposals,
    events,
    retention,
    router: createChatRouter(createChatController(conversations, messages, proposals), sessions),
  };
}
