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
  realtime = attachChatRealtime(http, fixture.chat, fixture.sessions, fixture.config.origins);
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
