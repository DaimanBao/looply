import { describe, it, expect, vi, afterEach } from "vitest";
import { ConversationPresence } from "./conversation-presence";
import {
  decodeCursor,
  encodeCursor,
  notificationPage,
  notificationRead,
} from "./notification.schema";

afterEach(() => vi.useRealTimers());
describe("Notification policy", () => {
  it("does not suppress using a socket that left while authority was being revalidated", async () => {
    const presence = new ConversationPresence();
    let authorize!: (valid: boolean) => void;
    presence.view(
      "socket",
      "recipient",
      "old",
      true,
      () =>
        new Promise((resolve) => {
          authorize = resolve;
        }),
    );
    const checking = presence.isViewing("recipient", "old");
    presence.view("socket", "recipient", "new", true);
    authorize(true);
    expect(await checking).toBe(false);
    expect(await presence.isViewing("recipient", "new")).toBe(true);
  });
  it("scopes cursors to the account and rejects malformed input", () => {
    const user = "6cdd4946-be64-4dd0-a6c7-31125305c975";
    const row = { id: "6cdd4946-be64-4dd0-a6c7-31125305c976", createdAt: new Date() };
    const cursor = encodeCursor(row, user);
    expect(decodeCursor(cursor, user)).toEqual(row);
    expect(() => decodeCursor(cursor, row.id)).toThrow();
    expect(() => decodeCursor("malformed", user)).toThrow();
    expect(notificationPage.safeParse({ limit: 51 }).success).toBe(false);
    expect(notificationPage.safeParse({ recipientId: user }).success).toBe(false);
    expect(notificationRead.safeParse({}).success).toBe(false);
    expect(notificationRead.safeParse({ expectedEventId: null }).success).toBe(true);
  });

  it("keeps presence per socket, handles tabs, route changes, leave and TTL", async () => {
    vi.useFakeTimers();
    const presence = new ConversationPresence();
    presence.view("one", "recipient", "chat", true);
    presence.view("two", "recipient", "chat", true);
    presence.leave("one");
    expect(await presence.isViewing("recipient", "chat")).toBe(true);
    expect(await presence.isViewing("other", "chat")).toBe(false);
    presence.view("two", "recipient", "new", true);
    expect(await presence.isViewing("recipient", "chat")).toBe(false);
    presence.view("two", "recipient", "chat", false);
    expect(await presence.isViewing("recipient", "new")).toBe(true);
    vi.advanceTimersByTime(35001);
    expect(await presence.isViewing("recipient", "new")).toBe(false);
  });
});
