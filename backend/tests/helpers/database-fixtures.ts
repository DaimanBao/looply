import { randomInt, randomUUID } from "node:crypto";
import type { Client } from "pg";

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type SqlValue = JsonValue | bigint | Date;
export type TestRow = Record<string, SqlValue> & { id: string };
export type Table =
  | "provinces"
  | "users"
  | "auth_sessions"
  | "otp_challenges"
  | "google_accounts"
  | "user_follows"
  | "user_blocks"
  | "listings"
  | "listing_follows"
  | "media_assets"
  | "conversations"
  | "conversation_participants"
  | "messages"
  | "transaction_proposals"
  | "notifications"
  | "outbox_events"
  | "processed_events";
export type ChatTable = Table | "listing_card_snapshots";
export type LegacyFixtureRows = Record<Table, TestRow>;
export type FixtureRows = Record<ChatTable, TestRow>;

/** Chỉ quote định danh fixture nội bộ, không dùng đầu vào ngoài. */
function identifier(value: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) throw new Error("Invalid fixture identifier");
  return `"${value}"`;
}

/** Thêm giá trị fixture tường minh bằng SQL tham số hóa và trả hàng đã lưu. */
export async function insertRow(
  client: Client,
  table: ChatTable,
  values: TestRow,
): Promise<TestRow> {
  const columns = Object.keys(values);
  const placeholders = columns.map((_, index) => `$${index + 1}`);
  const result = await client.query<TestRow>(
    `INSERT INTO ${identifier(table)} (${columns.map(identifier).join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING *`,
    Object.values(values),
  );
  const row = result.rows[0];
  if (!row) throw new Error("Fixture insert returned no row");
  return row;
}

/** Đổi một hàng fixture; mỗi câu lệnh lỗi là câu lệnh cuối trước rollback. */
export async function updateRow(
  client: Client,
  table: ChatTable,
  id: string,
  changes: Record<string, SqlValue>,
): Promise<TestRow> {
  const assignments = Object.keys(changes).map(
    (column, index) => `${identifier(column)} = $${index + 2}`,
  );
  const result = await client.query<TestRow>(
    `UPDATE ${identifier(table)} SET ${assignments.join(", ")} WHERE id = $1 RETURNING *`,
    [id, ...Object.values(changes)],
  );
  const row = result.rows[0];
  if (!row) throw new Error("Fixture update returned no row");
  return row;
}

/** Tạo đồ thị FK hợp lệ đầy đủ, không commit hoặc tác động bản ghi hiện có. */
export async function createLegacyFixtures(client: Client): Promise<LegacyFixtureRows> {
  const now = new Date();
  const province = await insertRow(client, "provinces", {
    id: randomUUID(),
    code: randomUUID().slice(0, 30),
    name: "Test Province",
    updatedAt: now,
  });
  const owner = await insertRow(client, "users", {
    id: randomUUID(),
    username: `test_${randomUUID().replaceAll("-", "").slice(0, 20)}`,
    displayName: "Test Owner",
    provinceId: province.id,
    email: `${randomUUID()}@example.com`,
    emailVerifiedAt: now,
    phone: `+849${randomInt(10000000, 100000000)}`,
    phoneVerifiedAt: now,
    updatedAt: now,
  });
  const contact = await insertRow(client, "users", {
    id: randomUUID(),
    username: `test_${randomUUID().replaceAll("-", "").slice(0, 20)}`,
    displayName: "Test Contact",
    updatedAt: now,
  });
  const listing = await insertRow(client, "listings", {
    id: randomUUID(),
    ownerId: owner.id,
    provinceId: province.id,
    title: "Valid listing title",
    searchTitle: "valid listing title",
    description: "A sufficiently detailed listing description.",
    type: "SALE",
    price: "100000",
    updatedAt: now,
  });
  const media = await insertRow(client, "media_assets", {
    id: randomUUID(),
    uploadedById: owner.id,
    purpose: "LISTING",
    type: "IMAGE",
    listingId: listing.id,
    storageKey: `test/${randomUUID()}`,
    mimeType: "image/jpeg",
    sizeBytes: 1,
    status: "ATTACHED",
  });
  const conversation = await insertRow(client, "conversations", {
    id: randomUUID(),
    type: "LISTING",
    listingId: listing.id,
    initiatorId: contact.id,
    contactUserId: contact.id,
    updatedAt: now,
  });
  const proposal = await insertRow(client, "transaction_proposals", {
    id: randomUUID(),
    conversationId: conversation.id,
    listingId: listing.id,
    proposerId: contact.id,
    type: "SALE",
    proposalKind: "LISTED_PRICE",
    proposedPrice: "100000",
    listedPriceSnapshot: "100000",
    createdCycle: 1,
  });
  const message = await insertRow(client, "messages", {
    id: randomUUID(),
    conversationId: conversation.id,
    senderId: contact.id,
    requestId: randomUUID(),
    type: "TEXT",
    content: "Test message",
    payloadHash: "fixture-payload-hash",
  });
  return {
    provinces: province,
    users: owner,
    listings: listing,
    media_assets: media,
    conversations: conversation,
    transaction_proposals: proposal,
    messages: message,
    auth_sessions: await insertRow(client, "auth_sessions", {
      id: randomUUID(),
      userId: owner.id,
      refreshTokenHash: `test-hash-${randomUUID()}`,
      expiresAt: new Date(now.getTime() + 60000),
    }),
    otp_challenges: await insertRow(client, "otp_challenges", {
      id: randomUUID(),
      userId: owner.id,
      destination: `${randomUUID()}@example.com`,
      channel: "EMAIL",
      purpose: "VERIFY_EMAIL",
      codeHash: "test-otp-hash",
      expiresAt: new Date(now.getTime() + 60000),
    }),
    google_accounts: await insertRow(client, "google_accounts", {
      id: randomUUID(),
      userId: owner.id,
      googleSubject: `test-${randomUUID()}`,
    }),
    user_follows: await insertRow(client, "user_follows", {
      id: randomUUID(),
      followerId: owner.id,
      followingId: contact.id,
    }),
    user_blocks: await insertRow(client, "user_blocks", {
      id: randomUUID(),
      blockerId: owner.id,
      blockedId: contact.id,
    }),
    listing_follows: await insertRow(client, "listing_follows", {
      id: randomUUID(),
      userId: contact.id,
      listingId: listing.id,
    }),
    conversation_participants: await insertRow(client, "conversation_participants", {
      id: randomUUID(),
      conversationId: conversation.id,
      userId: contact.id,
      lastReadMessageId: message.id,
    }),
    notifications: await insertRow(client, "notifications", {
      id: randomUUID(),
      recipientId: owner.id,
      type: "MESSAGE",
      conversationId: conversation.id,
      listingId: listing.id,
      proposalId: proposal.id,
      latestMessageId: message.id,
      eventKey: `test-${randomUUID()}`,
      updatedAt: now,
    }),
    ...(await createOutboxFixtures(client, listing.id)),
  };
}

/** Tạo thêm snapshot chuẩn cho schema hiện tại, giữ fixture riêng cho kiểm thử migration lịch sử. */
export async function createFixtures(client: Client): Promise<FixtureRows> {
  const rows = await createLegacyFixtures(client);
  const snapshot = await insertRow(client, "listing_card_snapshots", {
    id: randomUUID(),
    conversationId: rows.conversations.id,
    listingId: rows.listings.id,
    title: "Historical listing card",
    type: "SALE",
    listedPrice: "100000",
    sourceMediaId: rows.media_assets.id,
    sourceListingVersion: 1,
    imageStorageKey: `chat-snapshot/${randomUUID()}.webp`,
  });
  return { ...rows, listing_card_snapshots: snapshot };
}

/** Tạo sự kiện outbox và biên nhận consumer độc lập. */
async function createOutboxFixtures(
  client: Client,
  listingId: string,
): Promise<Pick<FixtureRows, "outbox_events" | "processed_events">> {
  const event = await insertRow(client, "outbox_events", {
    id: randomUUID(),
    eventType: "test.event",
    aggregateType: "Listing",
    aggregateId: listingId,
    payload: JSON.stringify({ listingId }),
  });
  return {
    outbox_events: event,
    processed_events: await insertRow(client, "processed_events", {
      id: randomUUID(),
      consumerName: "test-consumer",
      eventId: event.id,
    }),
  };
}
