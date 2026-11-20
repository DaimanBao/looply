-- CHECK của PostgreSQL chấp nhận NULL; phiên bản reservation phải được kiểm tra tường minh.
ALTER TABLE listing_card_snapshots ADD CONSTRAINT ck_snapshot_reservation_version
  CHECK ("imageState" <> 'PREPARING' OR "sourceListingVersion" IS NOT NULL);
