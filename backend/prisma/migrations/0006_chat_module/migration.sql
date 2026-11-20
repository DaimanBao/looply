-- Bổ sung Chat mà không sửa lịch sử hoặc xóa dữ liệu hiện có.
BEGIN;
CREATE TYPE "SnapshotImageState" AS ENUM ('PREPARING', 'AVAILABLE', 'REVOKED', 'DELETED');
ALTER TABLE conversations ADD COLUMN "lastActivityAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE conversations c SET "lastActivityAt" = GREATEST(c."createdAt",
  (SELECT max(m."createdAt") FROM messages m WHERE m."conversationId"=c.id),
  (SELECT max(p."resolvedAt") FROM transaction_proposals p WHERE p."conversationId"=c.id));
ALTER TABLE conversation_participants ADD COLUMN "lastDeliveredMessageId" uuid REFERENCES messages(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE media_assets ADD COLUMN "chatConversationId" uuid REFERENCES conversations(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE media_assets ADD CONSTRAINT ck_chat_upload_scope CHECK ("chatConversationId" IS NULL OR purpose='CHAT');
CREATE TABLE listing_card_snapshots (
  id uuid PRIMARY KEY,
  "messageId" uuid UNIQUE REFERENCES messages(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "conversationId" uuid NOT NULL REFERENCES conversations(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "listingId" uuid NOT NULL REFERENCES listings(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  title varchar(150) NOT NULL,
  type "ListingType" NOT NULL,
  "listedPrice" decimal(15,0),
  "rentalUnit" "RentalUnit",
  "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "snapshotCreatedAt" timestamptz(3),
  "sourceMediaId" uuid REFERENCES media_assets(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "sourceListingVersion" integer,
  "imageStorageKey" text NOT NULL UNIQUE,
  "imageSizeBytes" bigint,
  "imageState" "SnapshotImageState" NOT NULL DEFAULT 'PREPARING',
  "imageRevokedAt" timestamptz(3),
  "imageDeletedAt" timestamptz(3),
  CONSTRAINT ck_snapshot_terms CHECK (
    (type='EXCHANGE' AND "listedPrice" IS NULL AND "rentalUnit" IS NULL) OR
    (type='SALE' AND "listedPrice" IS NOT NULL AND "listedPrice">0 AND "listedPrice"<>'NaN'::numeric AND "rentalUnit" IS NULL) OR
    (type='RENT' AND "listedPrice" IS NOT NULL AND "listedPrice">0 AND "listedPrice"<>'NaN'::numeric AND "rentalUnit" IS NOT NULL)),
  CONSTRAINT ck_snapshot_image CHECK (
    ("imageState"='PREPARING' AND "messageId" IS NULL AND "snapshotCreatedAt" IS NULL AND "sourceMediaId" IS NOT NULL AND "sourceListingVersion">0 AND "imageRevokedAt" IS NULL AND "imageDeletedAt" IS NULL) OR
    ("imageState"='AVAILABLE' AND "messageId" IS NOT NULL AND "snapshotCreatedAt" IS NOT NULL AND "sourceMediaId" IS NULL AND "imageSizeBytes">0 AND "imageSizeBytes" IS NOT NULL AND "imageRevokedAt" IS NULL AND "imageDeletedAt" IS NULL) OR
    ("imageState"='REVOKED' AND "imageRevokedAt" IS NOT NULL AND "imageDeletedAt" IS NULL AND "sourceMediaId" IS NULL) OR
    ("imageState"='DELETED' AND "imageRevokedAt" IS NOT NULL AND "imageDeletedAt" IS NOT NULL AND "sourceMediaId" IS NULL))
);
CREATE INDEX "listing_card_snapshots_conversationId_idx" ON listing_card_snapshots("conversationId");
COMMIT;
