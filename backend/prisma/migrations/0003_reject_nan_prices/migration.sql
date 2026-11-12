-- PostgreSQL NUMERIC considers NaN greater than ordinary numbers, so > 0 alone is insufficient.
-- Retain every existing price/type/unit condition and replace the checks atomically.
BEGIN;

ALTER TABLE "listings"
    DROP CONSTRAINT "ck_listing_price_type",
    ADD CONSTRAINT "ck_listing_price_type" CHECK (
        (
            type = 'SALE'
            AND price IS NOT NULL
            AND price > 0
            AND price <> 'NaN'::numeric
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
            AND price <> 'NaN'::numeric
            AND "rentalUnit" IS NOT NULL
        )
    );

ALTER TABLE "transaction_proposals"
    DROP CONSTRAINT "ck_proposal_kind",
    ADD CONSTRAINT "ck_proposal_kind" CHECK (
        (
            type = 'EXCHANGE'
            AND "proposalKind" = 'EXCHANGE_CONTACT'
            AND "proposedPrice" IS NULL
            AND "rentalUnit" IS NULL
        )
        OR (
            type = 'SALE'
            AND "proposalKind" IN ('LISTED_PRICE', 'NEGOTIATED_PRICE')
            AND "proposedPrice" IS NOT NULL
            AND "proposedPrice" > 0
            AND "proposedPrice" <> 'NaN'::numeric
            AND "rentalUnit" IS NULL
        )
        OR (
            type = 'RENT'
            AND "proposalKind" IN ('LISTED_PRICE', 'NEGOTIATED_PRICE')
            AND "proposedPrice" IS NOT NULL
            AND "proposedPrice" > 0
            AND "proposedPrice" <> 'NaN'::numeric
            AND "rentalUnit" IS NOT NULL
        )
    ),
    -- A historical snapshot may remain NULL; only the invalid NaN value is newly excluded.
    ADD CONSTRAINT "ck_proposal_snapshot_not_nan" CHECK (
        "listedPriceSnapshot" IS NULL
        OR "listedPriceSnapshot" <> 'NaN'::numeric
    );

COMMIT;
