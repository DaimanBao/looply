BEGIN;

-- Serialize validation and replacement; never rewrite existing media rows.
LOCK TABLE "media_assets" IN ACCESS EXCLUSIVE MODE;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'media_assets'::regclass
          AND conname = 'ck_media_purpose' AND contype = 'c' AND convalidated
    ) THEN
        RAISE EXCEPTION 'Expected validated ck_media_purpose; review database before migration';
    END IF;
    IF EXISTS (
        SELECT 1 FROM "media_assets" WHERE NOT (
            (purpose = 'PROFILE' AND type = 'IMAGE' AND "listingId" IS NULL
             AND "isCover" = false AND position IS NULL)
            OR (purpose = 'LISTING' AND (status IN ('TEMP', 'DELETING') OR "listingId" IS NOT NULL))
            OR (purpose = 'CHAT' AND type = 'IMAGE' AND "listingId" IS NULL
                AND "isCover" = false AND position IS NULL)
        )
    ) THEN
        RAISE EXCEPTION 'Incompatible media rows; review without rewriting data';
    END IF;
END $$;

ALTER TABLE "media_assets" DROP CONSTRAINT ck_media_purpose;
ALTER TABLE "media_assets" ADD CONSTRAINT ck_media_purpose CHECK (
    (purpose = 'PROFILE' AND type = 'IMAGE' AND "listingId" IS NULL
     AND "isCover" = false AND position IS NULL)
    OR (purpose = 'LISTING' AND (status IN ('TEMP', 'DELETING') OR "listingId" IS NOT NULL))
    OR (purpose = 'CHAT' AND type = 'IMAGE' AND "listingId" IS NULL
        AND "isCover" = false AND position IS NULL)
);

COMMIT;
