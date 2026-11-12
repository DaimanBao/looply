-- VIDEO requires a measured duration; IMAGE has no duration.
-- Keep the replacement atomic and validate all existing rows before committing.
BEGIN;

ALTER TABLE "media_assets"
    DROP CONSTRAINT "ck_media_duration",
    ADD CONSTRAINT "ck_media_duration" CHECK (
        (
            type = 'IMAGE'
            AND "durationSeconds" IS NULL
        )
        OR (
            type = 'VIDEO'
            AND "durationSeconds" IS NOT NULL
            AND "durationSeconds" BETWEEN 1 AND 180
        )
    );

COMMIT;
