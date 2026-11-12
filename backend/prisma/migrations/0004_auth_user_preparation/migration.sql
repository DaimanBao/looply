BEGIN;

-- Serialize the preflight and index replacement with every concurrent User write.
LOCK TABLE "users" IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
    -- Match JavaScript trim() whitespace, without rewriting existing contact data.
    IF EXISTS (
        SELECT 1 FROM "users"
        WHERE "emailVerifiedAt" IS NOT NULL
        GROUP BY lower(btrim(email, E' \t\n\r\f\013' || U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'))
        HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'Verified email ownership conflicts; resolve explicitly before migration';
    END IF;

    IF EXISTS (
        SELECT 1 FROM "users"
        WHERE ("emailVerifiedAt" IS NOT NULL AND email IS NULL)
           OR char_length("displayName") NOT BETWEEN 1 AND 60
    ) THEN
        RAISE EXCEPTION 'Existing User data violates the approved email or display name rules';
    END IF;
END;
$$;

CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'PENDING_DELETION', 'DELETING', 'DELETED');

ALTER TABLE "users"
    ADD COLUMN "usernameChangedAt" TIMESTAMPTZ(3),
    ADD COLUMN "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    ADD COLUMN "deletionRequestedAt" TIMESTAMPTZ(3),
    ALTER COLUMN "displayName" TYPE VARCHAR(60),
    DROP CONSTRAINT "ck_user_username",
    ADD CONSTRAINT "ck_user_username" CHECK (username ~ '^[a-z0-9_]{3,30}$'),
    DROP CONSTRAINT "ck_user_verified_email",
    ADD CONSTRAINT "ck_user_verified_email" CHECK ("emailVerifiedAt" IS NULL OR email IS NOT NULL),
    ADD CONSTRAINT "ck_user_display_name" CHECK (char_length("displayName") BETWEEN 1 AND 60),
    -- DELETED may clear the request timestamp during anonymization or retain it.
    -- Transition ordering, the 30-day wait and irreversibility belong to conditional service updates.
    ADD CONSTRAINT "ck_user_deletion_state" CHECK (
        (status = 'ACTIVE' AND "deletionRequestedAt" IS NULL)
        OR (status IN ('PENDING_DELETION', 'DELETING') AND "deletionRequestedAt" IS NOT NULL)
        OR status = 'DELETED'
    );

-- Preserve dots and +suffix; the old global index remains until this protection exists.
CREATE UNIQUE INDEX "uq_user_verified_email" ON "users" (
    lower(btrim(email, E' \t\n\r\f\013' || U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'))
) WHERE "emailVerifiedAt" IS NOT NULL;

DROP INDEX "users_email_key";

COMMIT;
