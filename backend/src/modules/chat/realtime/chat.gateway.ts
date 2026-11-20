import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { z } from "zod";
import type { SessionService } from "../../auth";
import { AppError } from "../../../shared/errors/app-error";
import type { createChatModule } from "../chat.module";
import { chatId, messageInput } from "../chat.schema";

type Ack = (
  result: { ok: true; data: unknown } | { ok: false; error: { code: string; message: string } },
) => void;
type ClientEvents = {
  "conversation.join": (input: unknown, ack: Ack) => void;
  "message.send": (input: unknown, ack: Ack) => void;
  "conversation.read": (input: unknown, ack: Ack) => void;
  "conversation.delivered": (input: unknown, ack: Ack) => void;
};
type ServerEvents = { "chat.changed": (input: { conversationId: string }) => void };
type SocketData = { token: string };
const joinInput = z.strictObject({ conversationId: chatId });
const socketMessage = z.strictObject({ conversationId: chatId, message: messageInput });
const socketReceipt = z.strictObject({ conversationId: chatId, messageId: chatId });

/** Socket là transport mỏng: mọi nghiệp vụ chạy lại cùng Auth và application services của REST. */
export function attachChatRealtime(
  server: HttpServer,
  chat: ReturnType<typeof createChatModule>,
  sessions: SessionService,
  origins: string[],
) {
  const io = new Server<ClientEvents, ServerEvents, Record<string, never>, SocketData>(server, {
    maxHttpBufferSize: 64 * 1024,
    cors: { origin: origins, credentials: true },
    allowRequest: (request, done) =>
      done(null, !request.headers.origin || origins.includes(request.headers.origin)),
    serveClient: false,
  });
  const namespace = io.of("/chat");
  namespace.use(async (socket, next) => {
    try {
      const { token } = z
        .strictObject({ token: z.string().min(1).max(4096) })
        .parse(socket.handshake.auth);
      await sessions.authenticate(token);
      socket.data.token = token;
      next();
    } catch {
      next(new Error("UNAUTHENTICATED"));
    }
  });
  namespace.on("connection", (socket) => {
    let windowAt = Date.now();
    let count = 0;
    let running = 0;
    /** Validation/limits/auth diễn ra cho từng event; lỗi không chứa token hoặc nội dung input. */
    async function execute<T>(
      schema: z.ZodType<T>,
      input: unknown,
      ack: Ack,
      run: (
        value: T,
        principal: Awaited<ReturnType<SessionService["authenticate"]>>,
      ) => Promise<unknown>,
    ): Promise<void> {
      if (typeof ack !== "function") return;
      try {
        if (Date.now() - windowAt >= 60_000) {
          windowAt = Date.now();
          count = 0;
        }
        if (++count > 120 || running >= 4)
          throw new AppError(429, "RATE_LIMITED", "Slow down and retry.");
        const parsed = schema.safeParse(input);
        if (!parsed.success) throw new AppError(400, "VALIDATION_ERROR", "Invalid chat event.");
        running++;
        try {
          const principal = await sessions.authenticate(socket.data.token);
          ack({ ok: true, data: (await run(parsed.data, principal)) ?? null });
        } finally {
          running--;
        }
      } catch (error) {
        ack({
          ok: false,
          error: {
            code: error instanceof AppError ? error.code : "CHAT_UNAVAILABLE",
            message: error instanceof AppError ? error.message : "Chat is temporarily unavailable.",
          },
        });
      }
    }
    socket.on("conversation.join", (input, ack) => {
      void execute(joinInput, input, ack, async (value, principal) => {
        await chat.conversations.get(principal, value.conversationId);
        await socket.join(`conversation:${value.conversationId}`);
        return { conversationId: value.conversationId };
      });
    });
    socket.on("message.send", (input, ack) => {
      void execute(socketMessage, input, ack, (value, principal) =>
        chat.messages.send(principal, value.conversationId, value.message),
      );
    });
    socket.on("conversation.read", (input, ack) => {
      void execute(socketReceipt, input, ack, (value, principal) =>
        chat.messages.receipt(principal, value.conversationId, value.messageId, true),
      );
    });
    socket.on("conversation.delivered", (input, ack) => {
      void execute(socketReceipt, input, ack, (value, principal) =>
        chat.messages.receipt(principal, value.conversationId, value.messageId, false),
      );
    });
  });
  const unsubscribe = chat.events.subscribe(async (conversationId) => {
    // Không broadcast qua room đã cache quyền: kiểm tra phiên và participant từng client ngay trước emit.
    await Promise.allSettled(
      [...namespace.sockets.values()].map(async (socket) => {
        try {
          const principal = await sessions.authenticate(socket.data.token);
          await chat.conversations.get(principal, conversationId);
          if (socket.connected) socket.emit("chat.changed", { conversationId });
        } catch (error) {
          if (error instanceof AppError && error.status === 401) socket.disconnect(true);
        }
      }),
    );
  });
  return {
    io,
    /** Dừng socket trước close HTTP; không đóng HTTP server hai lần qua io.close(). */
    stop(): void {
      unsubscribe();
      namespace.disconnectSockets(true);
      io.engine.close();
    },
  };
}
