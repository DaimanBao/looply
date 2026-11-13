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

/** Composes private local development storage or the configured S3-compatible production adapter. */
export function createStorage(config: AuthConfig): ObjectStore {
  if (config.MEDIA_PROVIDER === "local") return new LocalObjectStore(config.MEDIA_LOCAL_DIRECTORY);
  if (!config.S3_ENDPOINT || !config.S3_BUCKET || !config.S3_ACCESS_KEY_ID || !config.S3_SECRET_ACCESS_KEY) throw new Error("Missing S3 configuration");
  return new S3ObjectStore(new S3Client({ endpoint: config.S3_ENDPOINT, region: config.S3_REGION, credentials: { accessKeyId: config.S3_ACCESS_KEY_ID, secretAccessKey: config.S3_SECRET_ACCESS_KEY }, maxAttempts: 2, requestHandler: { connectionTimeout: 5000, requestTimeout: 10000 } }), config.S3_BUCKET);
}
/** Keeps cross-module dependency wiring at the composition root, outside domain services. */
export function createFeatures(db: PrismaClient, config: AuthConfig, providers?: AuthProviders, storage: ObjectStore = createStorage(config), namespace?: string) {
  const auth = createAuthModule(db, config, providers, undefined, namespace);
  const repository = new UserRepository(db); const users = new UserService(repository, auth.sessions);
  const avatars = new AvatarService(users, repository, new AvatarMediaService(new MediaRepository(db), storage), auth.sessions);
  const deletionRepository = new DeletionRepository(db); const deletion = new DeletionService(deletionRepository, auth.sessions, auth.identity);
  const mediaCleanupRepository = new MediaCleanupRepository(db);
  const cleanup = new AccountCleanup(deletionRepository, new CleanupRepository(db), new MediaCleanupService(mediaCleanupRepository, storage, new MediaOrphanRecovery(mediaCleanupRepository, storage)), auth.credentials, auth.sessions);
  return { ...auth, users, avatars, deletion, cleanup, storage, routers: [...auth.routers, createUserRouter(createUserController(users, auth.credentials), auth.sessions), createAvatarRouter(createAvatarController(avatars), auth.sessions), createDeletionRouter(createDeletionController(deletion, config.environment === "production"), auth.sessions)] };
}
