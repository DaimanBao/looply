import { S3Client } from "@aws-sdk/client-s3";
import type { PrismaClient } from "./generated/prisma/client";
import type { AuthConfig } from "./config/auth-config";
import { createAuthModule, type AuthProviders } from "./modules/auth/auth.module";
import { UserRepository } from "./modules/user/user.repository";
import { UserService } from "./modules/user/user.service";
import { createUserController } from "./modules/user/http/user.controller";
import { createUserRouter } from "./modules/user/user.routes";
import { MediaRepository } from "./modules/media/media.repository";
import { LocalObjectStore, S3ObjectStore, type ObjectStore } from "./modules/media/object-store";
import { AvatarService } from "./modules/user/avatar.service";
import { createAvatarController } from "./modules/user/http/avatar.controller";
import { createAvatarRouter } from "./modules/user/avatar.routes";
import { DeletionRepository } from "./modules/user/deletion/deletion.repository";
import { DeletionService } from "./modules/user/deletion/deletion.service";
import { createDeletionController } from "./modules/user/deletion/deletion.controller";
import { createDeletionRouter } from "./modules/user/deletion/deletion.routes";
import { CleanupRepository } from "./jobs/cleanup.repository";
import { AccountCleanup } from "./modules/user/deletion/deletion.worker";
import { MediaCleanupRepository } from "./modules/media/media-cleanup.repository";
import { MediaOrphanRecovery } from "./modules/media/media-orphan-recovery.service";
import { MediaCleanupService, AvatarMediaService } from "./modules/media";
import { ListingMediaRepository } from "./modules/media/listing-media.repository";
import { ListingMediaService, ListingManifestService } from "./modules/media";
import { ListingUploadService } from "./modules/media/listing-upload.service";
import { createListingUploadController } from "./modules/media/listing-upload.controller";
import { createListingUploadRouter } from "./modules/media/listing-upload.routes";
import { ListingRepository } from "./modules/listing/listing.repository";
import { ListingService } from "./modules/listing/listing.service";
import { createListingController } from "./modules/listing/listing.controller";
import { createListingRouter } from "./modules/listing/listing.routes";
import { ListingDiscoveryRepository } from "./modules/listing/listing-discovery.repository";
import { ListingDiscoveryService } from "./modules/listing/listing-discovery.service";
import { ListingFollowRepository } from "./modules/listing/listing-follow.repository";
import { ListingFollowService } from "./modules/listing/listing-follow.service";
import { createListingDiscoveryController } from "./modules/listing/listing-discovery.controller";
import { createListingDiscoveryRouter } from "./modules/listing/listing-discovery.routes";

/** Lắp ghép storage local riêng cho development hoặc adapter S3-compatible đã cấu hình cho production. */
export function createStorage(config: AuthConfig): ObjectStore {
  if (config.MEDIA_PROVIDER === "local") return new LocalObjectStore(config.MEDIA_LOCAL_DIRECTORY);
  if (
    !config.S3_ENDPOINT ||
    !config.S3_BUCKET ||
    !config.S3_ACCESS_KEY_ID ||
    !config.S3_SECRET_ACCESS_KEY
  )
    throw new Error("Missing S3 configuration");
  return new S3ObjectStore(
    new S3Client({
      endpoint: config.S3_ENDPOINT,
      region: config.S3_REGION,
      credentials: {
        accessKeyId: config.S3_ACCESS_KEY_ID,
        secretAccessKey: config.S3_SECRET_ACCESS_KEY,
      },
      maxAttempts: 2,
      requestHandler: { connectionTimeout: 5000, requestTimeout: 10000 },
    }),
    config.S3_BUCKET,
  );
}
/** Giữ việc nối phụ thuộc liên module tại composition root, ngoài domain service. */
export function createFeatures(
  db: PrismaClient,
  config: AuthConfig,
  providers?: AuthProviders,
  storage: ObjectStore = createStorage(config),
  namespace?: string,
) {
  const auth = createAuthModule(db, config, providers, undefined, namespace);
  const repository = new UserRepository(db);
  const users = new UserService(repository, auth.sessions);
  const avatars = new AvatarService(
    users,
    repository,
    new AvatarMediaService(new MediaRepository(db), storage),
    auth.sessions,
  );
  const deletionRepository = new DeletionRepository(db);
  const deletion = new DeletionService(deletionRepository, auth.sessions, auth.identity);
  const mediaCleanupRepository = new MediaCleanupRepository(db);
  const listingMediaRepository = new ListingMediaRepository(db);
  const listingMedia = new ListingMediaService(listingMediaRepository, storage);
  const listingUploads = new ListingUploadService(
    listingMedia,
    listingMediaRepository,
    auth.sessions,
  );
  const listingRepository = new ListingRepository(db);
  const listings = new ListingService(
    listingRepository,
    auth.sessions,
    new ListingManifestService(listingMediaRepository, listingMedia, storage),
  );
  const discovery = new ListingDiscoveryService(
    listingRepository,
    new ListingDiscoveryRepository(),
    auth.sessions,
  );
  const listingFollows = new ListingFollowService(
    listingRepository,
    new ListingFollowRepository(),
    auth.sessions,
  );
  const cleanup = new AccountCleanup(
    deletionRepository,
    new CleanupRepository(db),
    new MediaCleanupService(
      mediaCleanupRepository,
      storage,
      new MediaOrphanRecovery(mediaCleanupRepository, storage),
    ),
    auth.credentials,
    auth.sessions,
  );
  return {
    ...auth,
    users,
    avatars,
    deletion,
    cleanup,
    storage,
    listings,
    listingUploads,
    discovery,
    listingFollows,
    routers: [
      ...auth.routers,
      createUserRouter(createUserController(users, auth.credentials), auth.sessions),
      createAvatarRouter(createAvatarController(avatars), auth.sessions),
      createDeletionRouter(
        createDeletionController(deletion, config.environment === "production"),
        auth.sessions,
      ),
      createListingRouter(
        createListingController(listings),
        auth.sessions,
        createListingDiscoveryRouter(
          createListingDiscoveryController(discovery, listingFollows),
          auth.sessions,
        ),
      ),
      createListingUploadRouter(createListingUploadController(listingUploads), auth.sessions),
    ],
  };
}
