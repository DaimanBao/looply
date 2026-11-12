import type { Table } from "./database-fixtures";

// Explicit migration contract: the catalog test detects missing or extra constraints.
export const foreignKeys: ReadonlyArray<readonly [Table, string, Table]> = [
  ["users", "avatarMediaId", "media_assets"], ["users", "provinceId", "provinces"],
  ["auth_sessions", "userId", "users"], ["otp_challenges", "userId", "users"],
  ["google_accounts", "userId", "users"],
  ["user_follows", "followerId", "users"], ["user_follows", "followingId", "users"],
  ["user_blocks", "blockerId", "users"], ["user_blocks", "blockedId", "users"],
  ["listings", "ownerId", "users"], ["listings", "provinceId", "provinces"],
  ["listing_follows", "userId", "users"], ["listing_follows", "listingId", "listings"],
  ["media_assets", "uploadedById", "users"], ["media_assets", "listingId", "listings"],
  ["conversations", "listingId", "listings"], ["conversations", "initiatorId", "users"],
  ["conversations", "contactUserId", "users"], ["conversations", "directUserLowId", "users"],
  ["conversations", "directUserHighId", "users"],
  ["conversation_participants", "conversationId", "conversations"],
  ["conversation_participants", "userId", "users"], ["conversation_participants", "lastReadMessageId", "messages"],
  ["messages", "conversationId", "conversations"], ["messages", "senderId", "users"],
  ["messages", "imageMediaId", "media_assets"], ["messages", "proposalId", "transaction_proposals"],
  ["transaction_proposals", "conversationId", "conversations"], ["transaction_proposals", "listingId", "listings"],
  ["transaction_proposals", "proposerId", "users"],
  ["notifications", "recipientId", "users"], ["notifications", "conversationId", "conversations"],
  ["notifications", "listingId", "listings"], ["notifications", "proposalId", "transaction_proposals"],
  ["notifications", "latestMessageId", "messages"], ["processed_events", "eventId", "outbox_events"],
];

export const uniqueKeys: ReadonlyArray<readonly [Table, readonly string[]]> = [
  ["provinces", ["code"]], ["users", ["username"]],
  ["users", ["phone"]], ["users", ["avatarMediaId"]],
  ["auth_sessions", ["refreshTokenHash"]], ["google_accounts", ["userId"]],
  ["google_accounts", ["googleSubject"]], ["user_follows", ["followerId", "followingId"]],
  ["user_blocks", ["blockerId", "blockedId"]], ["listing_follows", ["userId", "listingId"]],
  ["media_assets", ["storageKey"]], ["conversations", ["listingId", "contactUserId"]],
  ["conversations", ["directUserLowId", "directUserHighId"]],
  ["conversation_participants", ["conversationId", "userId"]],
  ["messages", ["proposalId"]], ["messages", ["imageMediaId"]],
  ["messages", ["conversationId", "senderId", "requestId"]],
  ["processed_events", ["consumerName", "eventId"]],
];
