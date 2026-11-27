import type { RequestHandler } from "express";
import { z } from "zod";
import { principal } from "../auth";
import { AppError } from "../../shared/errors/app-error";
import { parseRequest, validatedHandler } from "../../shared/middleware/validate-request";
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
  const conversationParams = z.object({ conversationId: chatId });
  const emptyQuery = z.strictObject({});
  const conversation = z.object({ params: conversationParams, query: emptyQuery });
  const message = z.object({
    params: conversationParams.extend({ messageId: chatId }),
    query: emptyQuery,
  });
  const messageBody = z.object({ body: messageInput });
  const receiptBody = z.object({ body: receiptInput });
  const proposalBody = z.object({ body: proposalInput });
  const resolutionBody = z.object({ body: resolveInput });
  /** Tạo mới hoặc trả Conversation duy nhất đã có. */
  const create = validatedHandler(
    z.object({ body: conversationInput }),
    async ({ body }, response) => {
      response.json(await conversations.create(principal(response), body));
    },
  );
  /** Trả trang Inbox theo filter đã được middleware kiểm tra. */
  const inbox = validatedHandler(z.object({ query: inboxQuery }), async ({ query }, response) => {
    response.json(await conversations.inbox(principal(response), query));
  });
  /** Trả metadata an toàn của Conversation thuộc participant. */
  const get = validatedHandler(conversation, async ({ params }, response) => {
    response.json(await conversations.get(principal(response), params.conversationId));
  });
  /** Chỉ ẩn Inbox cá nhân, giữ lịch sử cho cả hai. */
  const hide = validatedHandler(conversation, async ({ params }, response) => {
    await conversations.hide(principal(response), params.conversationId);
    response.sendStatus(204);
  });
  /** Tải một trang lịch sử, không tự đánh dấu đã đọc khi GET. */
  const history = validatedHandler(
    z.object({ params: conversationParams, query: chatPage }),
    async ({ params, query }, response) => {
      response.json(await messages.history(principal(response), params.conversationId, query));
    },
  );
  /** Payload không được khai báo sender; danh tính lấy từ Auth. */
  const send = validatedHandler(conversation, async ({ params }, response, request) => {
    // UUID và query sai được báo trước body như các route Chat cũ.
    const { body } = parseRequest(messageBody, request);
    response.json(await messages.send(principal(response), params.conversationId, body));
  });
  /** Xác nhận đã xem từ client, không suy từ việc phát socket. */
  const read = validatedHandler(conversation, async ({ params }, response, request) => {
    const { body } = parseRequest(receiptBody, request);
    await messages.receipt(principal(response), params.conversationId, body.messageId, true);
    response.sendStatus(204);
  });
  /** Xác nhận đã nhận và giữ read cursor hiện có. */
  const delivered = validatedHandler(conversation, async ({ params }, response, request) => {
    const { body } = parseRequest(receiptBody, request);
    await messages.receipt(principal(response), params.conversationId, body.messageId, false);
    response.sendStatus(204);
  });
  /** Gửi card qua quy trình prepare/copy/publish snapshot. */
  const propose = validatedHandler(conversation, async ({ params }, response, request) => {
    const { body } = parseRequest(proposalBody, request);
    response.json(await proposals.create(principal(response), params.conversationId, body));
  });
  /** Chủ Listing xử lý proposal có kiểm soát đồng thời. */
  const resolve = validatedHandler(
    z.object({ params: conversationParams.extend({ proposalId: chatId }), query: emptyQuery }),
    async ({ params }, response, request) => {
      const { body } = parseRequest(resolutionBody, request);
      response.json(
        await proposals.resolve(
          principal(response),
          params.conversationId,
          params.proposalId,
          body.status,
        ),
      );
    },
  );
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
  const cancel = validatedHandler(
    z.object({ params: conversationParams.extend({ mediaId: chatId }), query: emptyQuery }),
    async ({ params }, response) => {
      await messages.cancel(principal(response), params.conversationId, params.mediaId);
      response.sendStatus(204);
    },
  );
  /** Phân phối ảnh Message qua cổng membership, không mount private storage. */
  const image = validatedHandler(message, async ({ params }, response) => {
    response
      .type("image/webp")
      .send(await messages.image(principal(response), params.conversationId, params.messageId));
  });
  /** Snapshot quá hạn trả 404 ngay cả khi cleanup chưa chạy. */
  const snapshot = validatedHandler(message, async ({ params }, response) => {
    response
      .type("image/webp")
      .send(await proposals.image(principal(response), params.conversationId, params.messageId));
  });
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
