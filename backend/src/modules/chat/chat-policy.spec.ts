import { describe, expect, it } from "vitest";
import {
  addMonthsUTC,
  snapshotExpiry,
  decodeChatCursor,
  encodeChatCursor,
  isAfter,
} from "./chat-policy";
import { messageInput, proposalInput } from "./chat.schema";

describe("Chat policy", () => {
  it("clamps leap days and preserves UTC time", () => {
    expect(addMonthsUTC(new Date("2024-02-29T12:34:56.789Z"), 12).toISOString()).toBe(
      "2025-02-28T12:34:56.789Z",
    );
    expect(addMonthsUTC(new Date("2025-01-31T00:00:00Z"), 1).toISOString()).toBe(
      "2025-02-28T00:00:00.000Z",
    );
  });
  it("caps snapshot retention at 24 calendar months", () => {
    expect(snapshotExpiry(new Date("2024-01-01Z"), new Date("2025-12-01Z")).toISOString()).toBe(
      "2026-01-01T00:00:00.000Z",
    );
  });
  it("rejects cross-account cursors and orders equal timestamps by ID", () => {
    const row = { id: "dcfe86c5-6fb6-43fb-8f9b-b10847352f81", createdAt: new Date() };
    const cursor = encodeChatCursor("owner:a", row);
    expect(decodeChatCursor(cursor, "owner:a")).toEqual(row);
    expect(() => decodeChatCursor(cursor, "owner:b")).toThrow();
    expect(isAfter({ ...row, id: "ffffffff-ffff-4fff-8fff-ffffffffffff" }, row)).toBe(true);
  });
  it("validates emoji by code points and rejects impersonation and extra images", () => {
    const requestId = "dcfe86c5-6fb6-43fb-8f9b-b10847352f81";
    expect(messageInput.safeParse({ requestId, content: "😀".repeat(5000) }).success).toBe(true);
    for (const input of [
      { requestId },
      { requestId, content: "   " },
      { requestId, content: "x\u0000y" },
      { requestId, content: "\ud800" },
      { requestId, content: "ok", senderId: requestId },
      { requestId, imageMediaIds: [requestId] },
    ])
      expect(messageInput.safeParse(input).success).toBe(false);
    expect(
      proposalInput.safeParse({ requestId, kind: "NEGOTIATED_PRICE", proposedPrice: "0" }).success,
    ).toBe(false);
  });
});
