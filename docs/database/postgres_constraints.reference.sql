-- Looply DA1: REVIEWED-SCHEMA COMPANION, NOT AUTO-EXECUTED.
-- Apply ONLY after Prisma has created matching tables and columns in a reviewed migration.
-- This script is NOT a full migration and must NOT be executed against the current DB as-is.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE "users" ADD CONSTRAINT ck_user_username
  CHECK (username ~ '^[a-z0-9_]{3,30}$' AND username ~ '[a-z0-9]');
ALTER TABLE "users" ADD CONSTRAINT ck_user_verified_email
  CHECK ((email IS NULL AND "emailVerifiedAt" IS NULL) OR (email IS NOT NULL AND "emailVerifiedAt" IS NOT NULL));
ALTER TABLE "users" ADD CONSTRAINT ck_user_verified_phone
  CHECK ((phone IS NULL AND "phoneVerifiedAt" IS NULL) OR (phone IS NOT NULL AND "phoneVerifiedAt" IS NOT NULL));
ALTER TABLE "auth_sessions" ADD CONSTRAINT ck_session_version CHECK ("tokenVersion" >= 1);
ALTER TABLE "otp_challenges" ADD CONSTRAINT ck_otp_attempts CHECK (attempts BETWEEN 0 AND 5);
ALTER TABLE "user_follows" ADD CONSTRAINT ck_user_follow_self CHECK ("followerId" <> "followingId");
ALTER TABLE "user_blocks" ADD CONSTRAINT ck_user_block_self CHECK ("blockerId" <> "blockedId");

ALTER TABLE "listings" ADD CONSTRAINT ck_listing_price_type CHECK (
  (type = 'SALE' AND price > 0 AND "rentalUnit" IS NULL) OR
  (type = 'EXCHANGE' AND price IS NULL AND "rentalUnit" IS NULL) OR
  (type = 'RENT' AND price > 0 AND "rentalUnit" IS NOT NULL)
);
ALTER TABLE "listings" ADD CONSTRAINT ck_listing_cycle_version
  CHECK ("activeCycle" >= 1 AND version >= 1);
ALTER TABLE "listings" ADD CONSTRAINT ck_listing_deleted_at
  CHECK ((status = 'DELETED') = ("deletedAt" IS NOT NULL));
ALTER TABLE "listings" ADD CONSTRAINT ck_listing_title_description
  CHECK (char_length(btrim(title)) BETWEEN 10 AND 150 AND char_length(btrim(description)) BETWEEN 20 AND 5000);
CREATE INDEX idx_listing_search_trgm ON "listings" USING gin ("searchTitle" gin_trgm_ops);

ALTER TABLE "media_assets" ADD CONSTRAINT ck_media_size CHECK ("sizeBytes" > 0);
ALTER TABLE "media_assets" ADD CONSTRAINT ck_media_duration CHECK (
  (type = 'IMAGE' AND "durationSeconds" IS NULL) OR
  (type = 'VIDEO' AND "durationSeconds" BETWEEN 1 AND 180)
);
ALTER TABLE "media_assets" ADD CONSTRAINT ck_media_purpose CHECK (
  (purpose = 'PROFILE' AND type = 'IMAGE' AND "listingId" IS NULL AND "isCover" = false AND position IS NULL) OR
  (purpose = 'LISTING' AND (status = 'TEMP' OR "listingId" IS NOT NULL))
);
ALTER TABLE "media_assets" ADD CONSTRAINT ck_media_attached CHECK (status <> 'ATTACHED' OR (purpose = 'LISTING' AND "listingId" IS NOT NULL) OR (purpose = 'PROFILE'));
ALTER TABLE "media_assets" ADD CONSTRAINT ck_media_cover CHECK ("isCover" = false OR (purpose = 'LISTING' AND type = 'IMAGE' AND status = 'ATTACHED' AND "listingId" IS NOT NULL AND "deletedAt" IS NULL));
CREATE UNIQUE INDEX uq_listing_cover ON "media_assets" ("listingId")
  WHERE "isCover" = true AND "deletedAt" IS NULL;
CREATE UNIQUE INDEX uq_listing_video ON "media_assets" ("listingId")
  WHERE type = 'VIDEO' AND "deletedAt" IS NULL;
-- Media size and MIME validation MUST also inspect file contents in backend.

ALTER TABLE "conversations" ADD CONSTRAINT ck_conversation_shape CHECK (
  (type = 'LISTING' AND "listingId" IS NOT NULL AND "contactUserId" IS NOT NULL AND "directUserLowId" IS NULL AND "directUserHighId" IS NULL AND "initiatorId" = "contactUserId") OR
  (type = 'DIRECT' AND "listingId" IS NULL AND "contactUserId" IS NULL AND "directUserLowId" IS NOT NULL AND "directUserHighId" IS NOT NULL AND "directUserLowId" < "directUserHighId" AND "initiatorId" IN ("directUserLowId", "directUserHighId"))
);

ALTER TABLE "messages" ADD CONSTRAINT ck_message_shape CHECK (
  (type = 'TEXT' AND content IS NOT NULL AND char_length(btrim(content)) BETWEEN 1 AND 5000 AND "proposalId" IS NULL) OR
  (type = 'TRANSACTION_CARD' AND content IS NULL AND "proposalId" IS NOT NULL)
);

ALTER TABLE "transaction_proposals" ADD CONSTRAINT ck_proposal_cycles CHECK (
  "createdCycle" >= 1 AND
  ((status = 'PENDING' AND "acceptedCycle" IS NULL AND "resolvedAt" IS NULL) OR
   (status = 'REJECTED' AND "acceptedCycle" IS NULL AND "resolvedAt" IS NOT NULL) OR
   (status = 'ACCEPTED' AND "acceptedCycle" >= "createdCycle" AND "resolvedAt" IS NOT NULL))
);
ALTER TABLE "transaction_proposals" ADD CONSTRAINT ck_proposal_kind CHECK (
  (type = 'EXCHANGE' AND "proposalKind" = 'EXCHANGE_CONTACT' AND "proposedPrice" IS NULL AND "rentalUnit" IS NULL) OR
  (type = 'SALE' AND "proposalKind" IN ('LISTED_PRICE','NEGOTIATED_PRICE') AND "proposedPrice" > 0 AND "rentalUnit" IS NULL) OR
  (type = 'RENT' AND "proposalKind" IN ('LISTED_PRICE','NEGOTIATED_PRICE') AND "proposedPrice" > 0 AND "rentalUnit" IS NOT NULL)
);
CREATE UNIQUE INDEX uq_pending_proposal ON "transaction_proposals" ("conversationId")
  WHERE status = 'PENDING';
CREATE UNIQUE INDEX uq_accepted_proposal_cycle ON "transaction_proposals" ("listingId", "acceptedCycle")
  WHERE status = 'ACCEPTED' AND type IN ('SALE','EXCHANGE');

ALTER TABLE "notifications" ADD CONSTRAINT ck_notification_read CHECK (
  ("isRead" = false AND "readAt" IS NULL) OR ("isRead" = true AND "readAt" IS NOT NULL)
);
CREATE UNIQUE INDEX uq_unread_message_notification ON "notifications" ("recipientId", "conversationId")
  WHERE type = 'MESSAGE' AND "isRead" = false AND "deletedAt" IS NULL;
CREATE UNIQUE INDEX uq_notification_event_key ON "notifications" ("recipientId", "eventKey")
  WHERE "eventKey" IS NOT NULL;
ALTER TABLE "outbox_events" ADD CONSTRAINT ck_outbox_attempts CHECK (attempts >= 0);
