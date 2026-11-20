import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { io, type Socket } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAuthFixture, type AuthFixture } from "../helpers/auth-fixture";
import { attachChatRealtime } from "../../src/modules/chat";
import { z } from "zod";

let fixture: AuthFixture;
let http: Server;
let realtime: ReturnType<typeof attachChatRealtime>;
let address: string;
let tokens: string[];
let userIds: string[];
const clients: Socket[] = [];
beforeEach(async () => {
  fixture = await createAuthFixture();
  tokens = [];
  userIds = [];
  for (let index = 0; index < 3; index++) {
    const user = await fixture.user();
    const session = await fixture.db.$transaction((tx) => fixture.sessions.create(user, tx));
    tokens.push(session.accessToken);
    userIds.push(user.id);
  }
  http = createServer(fixture.app);
  realtime = attachChatRealtime(
    http,
    fixture.chat,
    fixture.sessions,
    fixture.config.origins,
    fixture.notifications,
  );
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  const bound = http.address();
  if (!bound || typeof bound === "string") throw new Error("Missing test port");
  address = `http://127.0.0.1:${bound.port}/chat`;
}, 15000);
afterEach(async () => {
  for (const client of clients.splice(0)) client.disconnect();
  if (realtime) await new Promise<void>((resolve) => realtime.io.close(() => resolve()));
  if (fixture) await fixture.dispose();
}, 15000);

/** Mở transport websocket thực, không giả lập socket hoặc bypass handshake Auth. */
function connect(token: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = io(address, {
      auth: { token },
      transports: ["websocket"],
      reconnection: false,
      timeout: 3000,
    });
    clients.push(socket);
    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", reject);
  });
}

/** Ack có deadline để sự kiện malformed không làm treo test. */
async function emit(socket: Socket, event: string, payload: unknown) {
  const result: unknown = await socket.timeout(3000).emitWithAck(event, payload);
  return z
    .object({
      ok: z.boolean(),
      data: z.unknown().optional(),
      error: z.object({ code: z.string() }).optional(),
    })
    .parse(result);
}

describe("Chat real Socket.IO transport", () => {
  it("authorizes visible-conversation heartbeats and suppresses only MESSAGE while viewing", async () => {
    const sender = await fixture.sessions.authenticate(tokens[0]);
    const recipient = await fixture.sessions.authenticate(tokens[1]);
    const row = await fixture.chat.conversations.create(sender, {
      type: "DIRECT",
      userId: userIds[1],
    });
    const [viewer, other] = await Promise.all([connect(tokens[1]), connect(tokens[2])]);
    expect(
      (await emit(other, "conversation.view", { conversationId: row.id, viewing: true })).error
        ?.code,
    ).toBe("NOT_FOUND");
    expect(
      (await emit(viewer, "conversation.view", { conversationId: row.id, viewing: true })).ok,
    ).toBe(true);
    await fixture.chat.messages.send(sender, row.id, {
      requestId: randomUUID(),
      content: "Đang xem",
    });
    await fixture.notifications.worker.runOnce();
    expect(await fixture.notifications.service.count(recipient)).toEqual({ count: 0 });
    await emit(viewer, "conversation.view", { conversationId: row.id, viewing: false });
    await fixture.chat.messages.send(sender, row.id, {
      requestId: randomUUID(),
      content: "Đã rời",
    });
    await fixture.notifications.worker.runOnce();
    expect(await fixture.notifications.service.count(recipient)).toEqual({ count: 1 });
    await emit(viewer, "conversation.view", { conversationId: row.id, viewing: true });
    await fixture.sessions.revoke(recipient, recipient.sessionId);
    expect(await fixture.notifications.presence.isViewing(recipient.userId, row.id)).toBe(false);
  });

  it("delivers notification invalidations only to current recipient sessions and resyncs after reconnect", async () => {
    const sender = await fixture.sessions.authenticate(tokens[0]);
    const recipient = await fixture.sessions.authenticate(tokens[1]);
    const row = await fixture.chat.conversations.create(sender, {
      type: "DIRECT",
      userId: userIds[1],
    });
    const [first, tab, unrelated] = await Promise.all([
      connect(tokens[1]),
      connect(tokens[1]),
      connect(tokens[2]),
    ]);
    const forbidden: unknown[] = [];
    unrelated.on("notification.changed", (value: unknown) => forbidden.push(value));
    const one = new Promise<unknown>((resolve) => first.once("notification.changed", resolve));
    const two = new Promise<unknown>((resolve) => tab.once("notification.changed", resolve));
    await fixture.chat.messages.send(sender, row.id, {
      requestId: randomUUID(),
      content: "Không phát preview",
    });
    await fixture.notifications.worker.runOnce();
    const events = await Promise.all([one, two]);
    const item = (await fixture.notifications.service.list(recipient, { limit: 30 })).data[0];
    expect(events).toEqual([{ notificationId: item.id }, { notificationId: item.id }]);
    expect(forbidden).toEqual([]);
    first.disconnect();
    await connect(tokens[1]);
    expect(await fixture.notifications.service.count(recipient)).toEqual({ count: 1 });
    const read = new Promise<unknown>((resolve) => tab.once("notification.changed", resolve));
    await fixture.notifications.service.read(recipient, item.id, item.lastEventId);
    expect(await read).toEqual({ notificationId: null });
    await fixture.sessions.revoke(recipient, recipient.sessionId);
    await expect(connect(tokens[1])).rejects.toThrow("UNAUTHENTICATED");
    expect(forbidden).toEqual([]);
  });
  it("rejects invalid handshake credentials", async () => {
    await expect(connect("invalid")).rejects.toThrow("UNAUTHENTICATED");
  });

  it("authorizes rooms and events, persists retries and broadcasts only to participants", async () => {
    const firstPrincipal = await fixture.sessions.authenticate(tokens[0]);
    const row = await fixture.chat.conversations.create(firstPrincipal, {
      type: "DIRECT",
      userId: userIds[1],
    });
    const [first, second, other] = await Promise.all(tokens.map(connect));
    expect((await emit(other, "conversation.join", { conversationId: row.id })).error?.code).toBe(
      "NOT_FOUND",
    );
    expect((await emit(first, "conversation.join", { conversationId: row.id })).ok).toBe(true);
    expect((await emit(second, "conversation.join", { conversationId: row.id })).ok).toBe(true);
    const observed: string[] = [];
    const forbidden: unknown[] = [];
    second.on("chat.changed", (value: { conversationId: string }) =>
      observed.push(value.conversationId),
    );
    other.on("chat.changed", (value: unknown) => forbidden.push(value));
    const payload = {
      conversationId: row.id,
      message: { requestId: randomUUID(), content: "Xin chào realtime 😀" },
    };
    const ack = await emit(first, "message.send", payload);
    expect(ack.ok).toBe(true);
    expect(observed).toContain(row.id);
    expect(forbidden).toHaveLength(0);
    expect((await emit(first, "message.send", payload)).data).toEqual(ack.data);
    expect(await fixture.db.message.count({ where: { conversationId: row.id } })).toBe(1);
    const message = z.object({ id: z.string() }).parse(ack.data);
    expect(
      (
        await emit(second, "conversation.delivered", {
          conversationId: row.id,
          messageId: message.id,
        })
      ).ok,
    ).toBe(true);
    expect(
      await emit(second, "conversation.read", { conversationId: row.id, messageId: message.id }),
    ).toEqual({ ok: true, data: null });
    expect(
      (await fixture.chat.messages.history(firstPrincipal, row.id, { limit: 30 })).data[0].state,
    ).toBe("READ");
    expect(
      (await emit(first, "message.send", { ...payload, senderId: userIds[2] })).error?.code,
    ).toBe("VALIDATION_ERROR");
    expect((await emit(other, "message.send", payload)).error?.code).toBe("NOT_FOUND");
  });

  it("revalidates a revoked session per event and reconnect recovers persisted history", async () => {
    const principal = await fixture.sessions.authenticate(tokens[0]);
    const row = await fixture.chat.conversations.create(principal, {
      type: "DIRECT",
      userId: userIds[1],
    });
    const first = await connect(tokens[0]);
    const sent = await emit(first, "message.send", {
      conversationId: row.id,
      message: { requestId: randomUUID(), content: "Bền vững" },
    });
    expect(sent.ok).toBe(true);
    first.disconnect();
    const reconnected = await connect(tokens[0]);
    expect((await emit(reconnected, "conversation.join", { conversationId: row.id })).ok).toBe(
      true,
    );
    expect(
      (await fixture.chat.messages.history(principal, row.id, { limit: 30 })).data,
    ).toHaveLength(1);
    await fixture.sessions.revoke(principal, principal.sessionId);
    expect(
      (await emit(reconnected, "conversation.join", { conversationId: row.id })).error?.code,
    ).toBe("UNAUTHENTICATED");
    await expect(connect(tokens[0])).rejects.toThrow("UNAUTHENTICATED");
  });
});
