import type { RequestHandler } from "express";
import { z } from "zod";
import { principal } from "../auth";
import { AppError } from "../../shared/errors/app-error";
import { body } from "../../shared/http/validated-body";
import type { ConversationService } from "./conversation.service";
import type { MessageService } from "./message.service";
import type { ProposalService } from "./proposal.service";
import {
  chatId,
  chatPage,
  conversationInput,
  inboxQuery,
  messageInput,
  proposalInput,
  receiptInput,
  resolveInput,
} from "./chat.schema";

/** Controller chỉ ánh xạ HTTP với các service dùng chung của Chat. */
export function createChatController(
  conversations: ConversationService,
  messages: MessageService,
  proposals: ProposalService,
) {
  /** Tạo mới hoặc trả Conversation duy nhất đã có. */
  const create: RequestHandler = async (_request, response) => {
    response.json(
      await conversations.create(principal(response), body(response, conversationInput)),
    );
  };
  /** Trả trang Inbox theo filter đã được middleware kiểm tra. */
  const inbox: RequestHandler = async (_request, response) => {
    const { query } = z.object({ query: inboxQuery }).parse(response.locals.validated);
    response.json(await conversations.inbox(principal(response), query));
  };
  /** Trả metadata an toàn của Conversation thuộc participant. */
  const get: RequestHandler = async (request, response) => {
    response.json(
      await conversations.get(principal(response), chatId.parse(request.params.conversationId)),
    );
  };
  /** Chỉ ẩn Inbox cá nhân, giữ lịch sử cho cả hai. */
  const hide: RequestHandler = async (request, response) => {
    await conversations.hide(principal(response), chatId.parse(request.params.conversationId));
    response.sendStatus(204);
  };
  /** Tải một trang lịch sử, không tự đánh dấu đã đọc khi GET. */
  const history: RequestHandler = async (request, response) => {
    const { query } = z.object({ query: chatPage }).parse(response.locals.validated);
    response.json(
      await messages.history(
        principal(response),
        chatId.parse(request.params.conversationId),
        query,
      ),
    );
  };
  /** Payload không được khai báo sender; danh tính lấy từ Auth. */
  const send: RequestHandler = async (request, response) => {
    response.json(
      await messages.send(
        principal(response),
        chatId.parse(request.params.conversationId),
        body(response, messageInput),
      ),
    );
  };
  /** Xác nhận đã xem từ client, không suy từ việc phát socket. */
  const read: RequestHandler = async (request, response) => {
    await messages.receipt(
      principal(response),
      chatId.parse(request.params.conversationId),
      body(response, receiptInput).messageId,
      true,
    );
    response.sendStatus(204);
  };
  /** Xác nhận đã nhận và giữ read cursor hiện có. */
  const delivered: RequestHandler = async (request, response) => {
    await messages.receipt(
      principal(response),
      chatId.parse(request.params.conversationId),
      body(response, receiptInput).messageId,
      false,
    );
    response.sendStatus(204);
  };
  /** Gửi card qua quy trình prepare/copy/publish snapshot. */
  const propose: RequestHandler = async (request, response) => {
    response.json(
      await proposals.create(
        principal(response),
        chatId.parse(request.params.conversationId),
        body(response, proposalInput),
      ),
    );
  };
  /** Chủ Listing xử lý proposal có kiểm soát đồng thời. */
  const resolve: RequestHandler = async (request, response) => {
    response.json(
      await proposals.resolve(
        principal(response),
        chatId.parse(request.params.conversationId),
        chatId.parse(request.params.proposalId),
        body(response, resolveInput).status,
      ),
    );
  };
  /** Chỉ nhận raw bytes giới hạn bởi middleware, không tin MIME/filename client. */
  const upload: RequestHandler = async (request, response) => {
    if (!Buffer.isBuffer(request.body))
      throw new AppError(415, "UNSUPPORTED_MEDIA", "Send image bytes as application/octet-stream.");
    response
      .status(201)
      .json(
        await messages.upload(
          principal(response),
          chatId.parse(request.params.conversationId),
          request.body,
        ),
      );
  };
  /** Hủy TEMP có quyền, không xóa Message hoặc ảnh đã gửi. */
  const cancel: RequestHandler = async (request, response) => {
    await messages.cancel(
      principal(response),
      chatId.parse(request.params.conversationId),
      chatId.parse(request.params.mediaId),
    );
    response.sendStatus(204);
  };
  /** Phân phối ảnh Message qua cổng membership, không mount private storage. */
  const image: RequestHandler = async (request, response) => {
    response
      .type("image/webp")
      .send(
        await messages.image(
          principal(response),
          chatId.parse(request.params.conversationId),
          chatId.parse(request.params.messageId),
        ),
      );
  };
  /** Snapshot quá hạn trả 404 ngay cả khi cleanup chưa chạy. */
  const snapshot: RequestHandler = async (request, response) => {
    response
      .type("image/webp")
      .send(
        await proposals.image(
          principal(response),
          chatId.parse(request.params.conversationId),
          chatId.parse(request.params.messageId),
        ),
      );
  };
  return {
    create,
    inbox,
    get,
    hide,
    history,
    send,
    read,
    delivered,
    propose,
    resolve,
    upload,
    cancel,
    image,
    snapshot,
  };
}
