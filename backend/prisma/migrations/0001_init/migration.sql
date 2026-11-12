-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "OtpChannel" AS ENUM ('SMS', 'EMAIL');

-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('REGISTER_PHONE', 'LOGIN_PHONE', 'CHANGE_PHONE', 'VERIFY_EMAIL', 'CHANGE_EMAIL');

-- CreateEnum
CREATE TYPE "ListingType" AS ENUM ('SALE', 'EXCHANGE', 'RENT');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('ACTIVE', 'HIDDEN', 'DELETED');

-- CreateEnum
CREATE TYPE "RentalUnit" AS ENUM ('DAY', 'MONTH');

-- CreateEnum
CREATE TYPE "MediaPurpose" AS ENUM ('PROFILE', 'LISTING', 'CHAT');

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('IMAGE', 'VIDEO');

-- CreateEnum
CREATE TYPE "MediaStatus" AS ENUM ('TEMP', 'ATTACHED', 'DELETING');

-- CreateEnum
CREATE TYPE "ConversationType" AS ENUM ('LISTING', 'DIRECT');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('TEXT', 'TRANSACTION_CARD');

-- CreateEnum
CREATE TYPE "ProposalKind" AS ENUM ('LISTED_PRICE', 'NEGOTIATED_PRICE', 'EXCHANGE_CONTACT');

-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('MESSAGE', 'TRANSACTION', 'LISTING_UPDATED');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED');

-- CreateTable
CREATE TABLE "provinces" (
    "id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ (3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ (3) NOT NULL,
    CONSTRAINT "provinces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "username" VARCHAR(30) NOT NULL,
    "passwordHash" TEXT,
    "displayName" VARCHAR(50) NOT NULL,
    "bio" VARCHAR(300),
    "avatarMediaId" UUID,
    "email" VARCHAR(254),
    "emailVerifiedAt" TIMESTAMPTZ (3),
    "phone" VARCHAR(20),
    "phoneVerifiedAt" TIMESTAMPTZ (3),
    "provinceId" UUID,
    "createdAt" TIMESTAMPTZ (3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ (3) NOT NULL,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "tokenVersion" INTEGER NOT NULL DEFAULT 1,
    "expiresAt" TIMESTAMPTZ (3) NOT NULL,
    "revokedAt" TIMESTAMPTZ (3),
    "lastUsedAt" TIMESTAMPTZ (3),
    "createdAt" TIMESTAMPTZ (3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_challenges" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "destination" VARCHAR(254) NOT NULL,
    "channel" "OtpChannel" NOT NULL,
    "purpose" "OtpPurpose" NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMPTZ (3) NOT NULL,
    "consumedAt" TIMESTAMPTZ (3),
    "invalidatedAt" TIMESTAMPTZ (3),
    "createdAt" TIMESTAMPTZ (3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "otp_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "google_accounts" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "googleSubject" VARCHAR(255) NOT NULL,
    "createdAt" TIMESTAMPTZ (3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "google_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_follows" (
    "id" UUID NOT NULL,
    "followerId" UUID NOT NULL,
    "followingId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ (3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_follows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_blocks" (
    "id" UUID NOT NULL,
    "blockerId" UUID NOT NULL,
    "blockedId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ (3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listings" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "searchTitle" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" "ListingType" NOT NULL,
    "status" "ListingStatus" NOT NULL DEFAULT 'ACTIVE',
    "price" DECIMAL(15, 0),
    "rentalUnit" "RentalUnit",
    "provinceId" UUID NOT NULL,
    "contactPhone" VARCHAR(20),
    "activeCycle" INTEGER NOT NULL DEFAULT 1,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ (3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ (3) NOT NULL,
    "deletedAt" TIMESTAMPTZ (3),
    CONSTRAINT "listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_follows" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "listingId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ (3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "listing_follows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_assets" (
    "id" UUID NOT NULL,
    "uploadedById" UUID NOT NULL,
    "purpose" "MediaPurpose" NOT NULL,
    "type" "MediaType" NOT NULL,
    "listingId" UUID,
    "storageKey" TEXT NOT NULL,
    "mimeType" VARCHAR(100) NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "durationSeconds" INTEGER,
    "position" INTEGER,
    "isCover" BOOLEAN NOT NULL DEFAULT false,
    "status" "MediaStatus" NOT NULL DEFAULT 'TEMP',
    "createdAt" TIMESTAMPTZ (3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ (3),
    "deletedAt" TIMESTAMPTZ (3),
    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "type" "ConversationType" NOT NULL,
    "listingId" UUID,
    "initiatorId" UUID NOT NULL,
    "contactUserId" UUID,
    "directUserLowId" UUID,
    "directUserHighId" UUID,
    "lastMessageAt" TIMESTAMPTZ (3),
    "createdAt" TIMESTAMPTZ (3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ (3) NOT NULL,
    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_participants" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "hiddenAt" TIMESTAMPTZ (3),
    "lastReadMessageId" UUID,
    "joinedAt" TIMESTAMPTZ (3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "conversation_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "senderId" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "type" "MessageType" NOT NULL,
    "content" TEXT,
    "proposalId" UUID,
    "imageMediaId" UUID,
    "payloadHash" VARCHAR(128) NOT NULL,
    "createdAt" TIMESTAMPTZ (3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction_proposals" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "listingId" UUID NOT NULL,
    "proposerId" UUID NOT NULL,
    "type" "ListingType" NOT NULL,
    "proposalKind" "ProposalKind" NOT NULL,
    "status" "ProposalStatus" NOT NULL DEFAULT 'PENDING',
    "listedPriceSnapshot" DECIMAL(15, 0),
    "proposedPrice" DECIMAL(15, 0),
    "rentalUnit" "RentalUnit",
    "createdCycle" INTEGER NOT NULL,
    "acceptedCycle" INTEGER,
    "createdAt" TIMESTAMPTZ (3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMPTZ (3),
    CONSTRAINT "transaction_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "recipientId" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "conversationId" UUID,
    "listingId" UUID,
    "proposalId" UUID,
    "eventKey" VARCHAR(200),
    "lastEventId" UUID,
    "latestMessageId" UUID,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMPTZ (3),
    "deletedAt" TIMESTAMPTZ (3),
    "createdAt" TIMESTAMPTZ (3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ (3) NOT NULL,
    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "eventType" VARCHAR(100) NOT NULL,
    "aggregateType" VARCHAR(100) NOT NULL,
    "aggregateId" UUID NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextRetryAt" TIMESTAMPTZ (3),
    "lockedUntil" TIMESTAMPTZ (3),
    "createdAt" TIMESTAMPTZ (3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMPTZ (3),
    "lastError" TEXT,
    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processed_events" (
    "id" UUID NOT NULL,
    "consumerName" VARCHAR(100) NOT NULL,
    "eventId" UUID NOT NULL,
    "processedAt" TIMESTAMPTZ (3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "processed_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "provinces_code_key" ON "provinces" ("code");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users" ("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_avatarMediaId_key" ON "users" ("avatarMediaId");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users" ("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users" ("phone");

-- CreateIndex
CREATE INDEX "users_provinceId_idx" ON "users" ("provinceId");

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_refreshTokenHash_key" ON "auth_sessions" ("refreshTokenHash");

-- CreateIndex
CREATE INDEX "auth_sessions_userId_revokedAt_idx" ON "auth_sessions" ("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "auth_sessions_expiresAt_idx" ON "auth_sessions" ("expiresAt");

-- CreateIndex
CREATE INDEX "otp_challenges_destination_purpose_createdAt_idx" ON "otp_challenges" (
    "destination",
    "purpose",
    "createdAt"
);

-- CreateIndex
CREATE INDEX "otp_challenges_userId_purpose_idx" ON "otp_challenges" ("userId", "purpose");

-- CreateIndex
CREATE INDEX "otp_challenges_expiresAt_idx" ON "otp_challenges" ("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "google_accounts_userId_key" ON "google_accounts" ("userId");

-- CreateIndex
CREATE UNIQUE INDEX "google_accounts_googleSubject_key" ON "google_accounts" ("googleSubject");

-- CreateIndex
CREATE INDEX "user_follows_followingId_idx" ON "user_follows" ("followingId");

-- CreateIndex
CREATE UNIQUE INDEX "user_follows_followerId_followingId_key" ON "user_follows" ("followerId", "followingId");

-- CreateIndex
CREATE INDEX "user_blocks_blockedId_idx" ON "user_blocks" ("blockedId");

-- CreateIndex
CREATE UNIQUE INDEX "user_blocks_blockerId_blockedId_key" ON "user_blocks" ("blockerId", "blockedId");

-- CreateIndex
CREATE INDEX "listings_status_createdAt_id_idx" ON "listings" ("status", "createdAt", "id");

-- CreateIndex
CREATE INDEX "listings_status_provinceId_createdAt_id_idx" ON "listings" (
    "status",
    "provinceId",
    "createdAt",
    "id"
);

-- CreateIndex
CREATE INDEX "listings_status_type_createdAt_id_idx" ON "listings" (
    "status",
    "type",
    "createdAt",
    "id"
);

-- CreateIndex
CREATE INDEX "listings_status_price_id_idx" ON "listings" ("status", "price", "id");

-- CreateIndex
CREATE INDEX "listings_ownerId_createdAt_idx" ON "listings" ("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "listing_follows_listingId_idx" ON "listing_follows" ("listingId");

-- CreateIndex
CREATE UNIQUE INDEX "listing_follows_userId_listingId_key" ON "listing_follows" ("userId", "listingId");

-- CreateIndex
CREATE UNIQUE INDEX "media_assets_storageKey_key" ON "media_assets" ("storageKey");

-- CreateIndex
CREATE INDEX "media_assets_listingId_position_idx" ON "media_assets" ("listingId", "position");

-- CreateIndex
CREATE INDEX "media_assets_status_expiresAt_idx" ON "media_assets" ("status", "expiresAt");

-- CreateIndex
CREATE INDEX "media_assets_uploadedById_createdAt_idx" ON "media_assets" ("uploadedById", "createdAt");

-- CreateIndex
CREATE INDEX "conversations_lastMessageAt_id_idx" ON "conversations" ("lastMessageAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_listingId_contactUserId_key" ON "conversations" ("listingId", "contactUserId");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_directUserLowId_directUserHighId_key" ON "conversations" (
    "directUserLowId",
    "directUserHighId"
);

-- CreateIndex
CREATE INDEX "conversation_participants_userId_hiddenAt_idx" ON "conversation_participants" ("userId", "hiddenAt");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_participants_conversationId_userId_key" ON "conversation_participants" ("conversationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "messages_proposalId_key" ON "messages" ("proposalId");

-- CreateIndex
CREATE UNIQUE INDEX "messages_imageMediaId_key" ON "messages" ("imageMediaId");

-- CreateIndex
CREATE INDEX "messages_conversationId_createdAt_id_idx" ON "messages" (
    "conversationId",
    "createdAt" DESC,
    "id" DESC
);

-- CreateIndex
CREATE UNIQUE INDEX "messages_conversationId_senderId_requestId_key" ON "messages" (
    "conversationId",
    "senderId",
    "requestId"
);

-- CreateIndex
CREATE INDEX "transaction_proposals_conversationId_createdAt_idx" ON "transaction_proposals" ("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "transaction_proposals_listingId_status_acceptedCycle_idx" ON "transaction_proposals" (
    "listingId",
    "status",
    "acceptedCycle"
);

-- CreateIndex
CREATE INDEX "notifications_recipientId_deletedAt_isRead_createdAt_id_idx" ON "notifications" (
    "recipientId",
    "deletedAt",
    "isRead",
    "createdAt" DESC,
    "id" DESC
);

-- CreateIndex
CREATE INDEX "notifications_conversationId_idx" ON "notifications" ("conversationId");

-- CreateIndex
CREATE INDEX "outbox_events_status_nextRetryAt_createdAt_idx" ON "outbox_events" (
    "status",
    "nextRetryAt",
    "createdAt"
);

-- CreateIndex
CREATE INDEX "outbox_events_lockedUntil_idx" ON "outbox_events" ("lockedUntil");

-- CreateIndex
CREATE INDEX "outbox_events_aggregateType_aggregateId_idx" ON "outbox_events" (
    "aggregateType",
    "aggregateId"
);

-- CreateIndex
CREATE UNIQUE INDEX "processed_events_consumerName_eventId_key" ON "processed_events" ("consumerName", "eventId");

-- AddForeignKey
ALTER TABLE "users"
ADD CONSTRAINT "users_avatarMediaId_fkey" FOREIGN KEY ("avatarMediaId") REFERENCES "media_assets" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users"
ADD CONSTRAINT "users_provinceId_fkey" FOREIGN KEY ("provinceId") REFERENCES "provinces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_sessions"
ADD CONSTRAINT "auth_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "otp_challenges"
ADD CONSTRAINT "otp_challenges_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "google_accounts"
ADD CONSTRAINT "google_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_follows"
ADD CONSTRAINT "user_follows_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_follows"
ADD CONSTRAINT "user_follows_followingId_fkey" FOREIGN KEY ("followingId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_blocks"
ADD CONSTRAINT "user_blocks_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_blocks"
ADD CONSTRAINT "user_blocks_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings"
ADD CONSTRAINT "listings_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings"
ADD CONSTRAINT "listings_provinceId_fkey" FOREIGN KEY ("provinceId") REFERENCES "provinces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_follows"
ADD CONSTRAINT "listing_follows_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_follows"
ADD CONSTRAINT "listing_follows_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets"
ADD CONSTRAINT "media_assets_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets"
ADD CONSTRAINT "media_assets_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations"
ADD CONSTRAINT "conversations_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations"
ADD CONSTRAINT "conversations_initiatorId_fkey" FOREIGN KEY ("initiatorId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations"
ADD CONSTRAINT "conversations_contactUserId_fkey" FOREIGN KEY ("contactUserId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations"
ADD CONSTRAINT "conversations_directUserLowId_fkey" FOREIGN KEY ("directUserLowId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations"
ADD CONSTRAINT "conversations_directUserHighId_fkey" FOREIGN KEY ("directUserHighId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_participants"
ADD CONSTRAINT "conversation_participants_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_participants"
ADD CONSTRAINT "conversation_participants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_participants"
ADD CONSTRAINT "conversation_participants_lastReadMessageId_fkey" FOREIGN KEY ("lastReadMessageId") REFERENCES "messages" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages"
ADD CONSTRAINT "messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages"
ADD CONSTRAINT "messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages"
ADD CONSTRAINT "messages_imageMediaId_fkey" FOREIGN KEY ("imageMediaId") REFERENCES "media_assets" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages"
ADD CONSTRAINT "messages_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "transaction_proposals" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_proposals"
ADD CONSTRAINT "transaction_proposals_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_proposals"
ADD CONSTRAINT "transaction_proposals_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_proposals"
ADD CONSTRAINT "transaction_proposals_proposerId_fkey" FOREIGN KEY ("proposerId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications"
ADD CONSTRAINT "notifications_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications"
ADD CONSTRAINT "notifications_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications"
ADD CONSTRAINT "notifications_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications"
ADD CONSTRAINT "notifications_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "transaction_proposals" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications"
ADD CONSTRAINT "notifications_latestMessageId_fkey" FOREIGN KEY ("latestMessageId") REFERENCES "messages" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processed_events"
ADD CONSTRAINT "processed_events_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "outbox_events" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Custom constraints for Looply DA1 (reviewed against initial Prisma DDL).
-- Do not execute standalone; this is appended to the initial migration.
-- Cross-row invariants (media counts, ownership, message/conversation matching)
-- remain service/transaction responsibilities.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE "users"
ADD CONSTRAINT ck_user_username CHECK (
    username ~ '^[a-z0-9_]{3,30}$'
    AND username ~ '[a-z0-9]'
);

ALTER TABLE "users"
ADD CONSTRAINT ck_user_verified_email CHECK (
    (
        email IS NULL
        AND "emailVerifiedAt" IS NULL
    )
    OR (
        email IS NOT NULL
        AND "emailVerifiedAt" IS NOT NULL
    )
);

ALTER TABLE "users"
ADD CONSTRAINT ck_user_verified_phone CHECK (
    (
        phone IS NULL
        AND "phoneVerifiedAt" IS NULL
    )
    OR (
        phone IS NOT NULL
        AND "phoneVerifiedAt" IS NOT NULL
    )
);

ALTER TABLE "auth_sessions"
ADD CONSTRAINT ck_session_version CHECK ("tokenVersion" >= 1);

ALTER TABLE "otp_challenges"
ADD CONSTRAINT ck_otp_attempts CHECK (attempts BETWEEN 0 AND 5);

ALTER TABLE "user_follows"
ADD CONSTRAINT ck_user_follow_self CHECK ("followerId" <> "followingId");

ALTER TABLE "user_blocks"
ADD CONSTRAINT ck_user_block_self CHECK ("blockerId" <> "blockedId");

ALTER TABLE "listings"
ADD CONSTRAINT ck_listing_price_type CHECK (
    (
        type = 'SALE'
        AND price IS NOT NULL
        AND price > 0
        AND "rentalUnit" IS NULL
    )
    OR (
        type = 'EXCHANGE'
        AND price IS NULL
        AND "rentalUnit" IS NULL
    )
    OR (
        type = 'RENT'
        AND price IS NOT NULL
        AND price > 0
        AND "rentalUnit" IS NOT NULL
    )
);

ALTER TABLE "listings"
ADD CONSTRAINT ck_listing_cycle_version CHECK (
    "activeCycle" >= 1
    AND version >= 1
);

ALTER TABLE "listings"
ADD CONSTRAINT ck_listing_deleted_at CHECK (
    (status = 'DELETED') = ("deletedAt" IS NOT NULL)
);

ALTER TABLE "listings"
ADD CONSTRAINT ck_listing_title_description CHECK (
    char_length(btrim (title)) BETWEEN 10 AND 150
    AND char_length(btrim (description)) BETWEEN 20 AND 5000
);

CREATE INDEX idx_listing_search_trgm ON "listings" USING gin ("searchTitle" gin_trgm_ops);

ALTER TABLE "media_assets"
ADD CONSTRAINT ck_media_size CHECK ("sizeBytes" > 0);

ALTER TABLE "media_assets"
ADD CONSTRAINT ck_media_duration CHECK (
    (
        type = 'IMAGE'
        AND "durationSeconds" IS NULL
    )
    OR (
        type = 'VIDEO'
        AND "durationSeconds" BETWEEN 1 AND 180
    )
);
-- CHAT media is an image without a Listing association. Message ownership
-- and attachment to exactly one message must be enforced transactionally.
ALTER TABLE "media_assets"
ADD CONSTRAINT ck_media_purpose CHECK (
    (
        purpose = 'PROFILE'
        AND type = 'IMAGE'
        AND "listingId" IS NULL
        AND "isCover" = false
        AND position IS NULL
    )
    OR (
        purpose = 'LISTING'
        AND (
            status = 'TEMP'
            OR "listingId" IS NOT NULL
        )
    )
    OR (
        purpose = 'CHAT'
        AND type = 'IMAGE'
        AND "listingId" IS NULL
        AND "isCover" = false
        AND position IS NULL
    )
);

ALTER TABLE "media_assets"
ADD CONSTRAINT ck_media_attached CHECK (
    status <> 'ATTACHED'
    OR (
        purpose = 'LISTING'
        AND "listingId" IS NOT NULL
    )
    OR purpose IN ('PROFILE', 'CHAT')
);

ALTER TABLE "media_assets"
ADD CONSTRAINT ck_media_cover CHECK (
    "isCover" = false
    OR (
        purpose = 'LISTING'
        AND type = 'IMAGE'
        AND status = 'ATTACHED'
        AND "listingId" IS NOT NULL
        AND "deletedAt" IS NULL
    )
);

CREATE UNIQUE INDEX uq_listing_cover ON "media_assets" ("listingId")
WHERE
    "isCover" = true
    AND "deletedAt" IS NULL;

CREATE UNIQUE INDEX uq_listing_video ON "media_assets" ("listingId")
  WHERE type = 'VIDEO' AND "deletedAt" IS NULL;
-- Media size and MIME validation MUST also inspect file contents in backend.

ALTER TABLE "conversations"
ADD CONSTRAINT ck_conversation_shape CHECK (
    (
        type = 'LISTING'
        AND "listingId" IS NOT NULL
        AND "contactUserId" IS NOT NULL
        AND "directUserLowId" IS NULL
        AND "directUserHighId" IS NULL
        AND "initiatorId" = "contactUserId"
    )
    OR (
        type = 'DIRECT'
        AND "listingId" IS NULL
        AND "contactUserId" IS NULL
        AND "directUserLowId" IS NOT NULL
        AND "directUserHighId" IS NOT NULL
        AND "directUserLowId" < "directUserHighId"
        AND "initiatorId" IN (
            "directUserLowId",
            "directUserHighId"
        )
    )
);

-- TEXT accepts text only, one image only, or text with one image.
-- TRANSACTION_CARD contains only a proposal reference.
ALTER TABLE "messages"
ADD CONSTRAINT ck_message_shape CHECK (
    (
        type = 'TEXT'
        AND "proposalId" IS NULL
        AND (
            content IS NULL
            OR char_length(btrim (content)) BETWEEN 1 AND 5000
        )
        AND (
            content IS NOT NULL
            OR "imageMediaId" IS NOT NULL
        )
    )
    OR (
        type = 'TRANSACTION_CARD'
        AND content IS NULL
        AND "imageMediaId" IS NULL
        AND "proposalId" IS NOT NULL
    )
);

ALTER TABLE "transaction_proposals"
ADD CONSTRAINT ck_proposal_cycles CHECK (
    "createdCycle" >= 1
    AND (
        (
            status = 'PENDING'
            AND "acceptedCycle" IS NULL
            AND "resolvedAt" IS NULL
        )
        OR (
            status = 'REJECTED'
            AND "acceptedCycle" IS NULL
            AND "resolvedAt" IS NOT NULL
        )
        OR (
            status = 'ACCEPTED'
            AND "acceptedCycle" IS NOT NULL
            AND "acceptedCycle" >= "createdCycle"
            AND "resolvedAt" IS NOT NULL
        )
    )
);

ALTER TABLE "transaction_proposals"
ADD CONSTRAINT ck_proposal_kind CHECK (
    (
        type = 'EXCHANGE'
        AND "proposalKind" = 'EXCHANGE_CONTACT'
        AND "proposedPrice" IS NULL
        AND "rentalUnit" IS NULL
    )
    OR (
        type = 'SALE'
        AND "proposalKind" IN (
            'LISTED_PRICE',
            'NEGOTIATED_PRICE'
        )
        AND "proposedPrice" IS NOT NULL
        AND "proposedPrice" > 0
        AND "rentalUnit" IS NULL
    )
    OR (
        type = 'RENT'
        AND "proposalKind" IN (
            'LISTED_PRICE',
            'NEGOTIATED_PRICE'
        )
        AND "proposedPrice" IS NOT NULL
        AND "proposedPrice" > 0
        AND "rentalUnit" IS NOT NULL
    )
);

CREATE UNIQUE INDEX uq_pending_proposal ON "transaction_proposals" ("conversationId")
WHERE
    status = 'PENDING';

CREATE UNIQUE INDEX uq_accepted_proposal_cycle ON "transaction_proposals" ("listingId", "acceptedCycle")
  WHERE status = 'ACCEPTED' AND type IN ('SALE','EXCHANGE');

ALTER TABLE "notifications"
ADD CONSTRAINT ck_notification_read CHECK (
    (
        "isRead" = false
        AND "readAt" IS NULL
    )
    OR (
        "isRead" = true
        AND "readAt" IS NOT NULL
    )
);

CREATE UNIQUE INDEX uq_unread_message_notification ON "notifications" ("recipientId", "conversationId")
  WHERE type = 'MESSAGE' AND "isRead" = false AND "deletedAt" IS NULL;

CREATE UNIQUE INDEX uq_notification_event_key ON "notifications" ("recipientId", "eventKey")
WHERE
    "eventKey" IS NOT NULL;

ALTER TABLE "outbox_events"
ADD CONSTRAINT ck_outbox_attempts CHECK (attempts >= 0);