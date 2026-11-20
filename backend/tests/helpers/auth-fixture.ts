import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { createClient } from "redis";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { createFeatures } from "../../src/features";
import { FakeMessageProvider } from "../../src/modules/auth/providers/message-provider";
import { loadAuthConfig } from "../../src/config/auth-config";
import { hashPassword } from "../../src/modules/auth/security/password";
import { createTestApp } from "./test-app";
import { getTestDatabaseUrl } from "./test-database";
import { AppError } from "../../src/shared/errors/app-error";
import type { GoogleIdentity } from "../../src/modules/auth/auth.types";
import type { ObjectStore } from "../../src/modules/media";

export type AuthFixture = Awaited<ReturnType<typeof createAuthFixture>>;

/** Xác minh đích PostgreSQL/Redis thật trước mọi ghi fixture; mỗi thay đổi có UUID hoặc namespace riêng. */
export async function createAuthFixture(storageOverride?: ObjectStore) {
  const redisUrl = process.env.TEST_REDIS_URL;
  if (!redisUrl || !/^\/[1-9][0-9]*$/.test(new URL(redisUrl).pathname))
    throw new Error("TEST_REDIS_URL must select a dedicated nonzero Redis database");
  const db = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: getTestDatabaseUrl(),
      connectionTimeoutMillis: 5000,
    }),
  });
  await db.$connect();
  const actual = await db.$queryRaw<Array<{ name: string }>>`SELECT current_database() AS name`;
  if (actual[0]?.name !== "looply_test") {
    await db.$disconnect();
    throw new Error("Unsafe Auth fixture database");
  }
  const prefix = `looply:test:${randomUUID()}:`;
  const config = loadAuthConfig(
    {
      REDIS_URL: redisUrl,
      AUTH_JWT_SECRET: randomBytes(48).toString("base64url"),
      AUTH_OTP_PEPPER: randomBytes(48).toString("base64url"),
      AUTH_ALLOWED_ORIGINS: "http://localhost:4200",
      GOOGLE_CLIENT_ID: "fixture-google-audience",
    },
    "test",
  );
  const sms = new FakeMessageProvider();
  const email = new FakeMessageProvider();
  const googleCredentials = new Map<string, GoogleIdentity>();
  const objects = new Map<string, Buffer>();
  const deletedKeys: string[] = [];
  const failures = { deletion: false };
  const storage = {
    async put(key: string, bytes: Buffer) {
      objects.set(key, bytes);
    },
    async get(key: string) {
      const bytes = objects.get(key);
      if (!bytes) throw new Error("Missing fixture object");
      return bytes;
    },
    async delete(key: string) {
      if (failures.deletion) throw new Error("Fixture storage outage");
      objects.delete(key);
      deletedKeys.push(key);
    },
  };
  const module = createFeatures(
    db,
    config,
    {
      sms,
      email,
      google: {
        async verify(credential) {
          const identity = googleCredentials.get(credential);
          if (!identity) throw new AppError(401, "UNAUTHENTICATED", "Authentication failed.");
          return identity;
        },
      },
      passwords: {
        async check(password) {
          if (password === "password")
            throw new AppError(400, "UNSAFE_PASSWORD", "Unsafe password.");
        },
      },
    },
    storageOverride ?? storage,
    prefix,
  );
  const redis = module.redis;
  await redis.connect();
  const app = createTestApp({
    featureRouters: module.routers,
    config: {
      jsonBodyLimitBytes: 11 * 1024 * 1024,
      corsOrigins: config.origins,
      corsCredentials: true,
    },
  });
  const userIds = new Set<string>();
  const provinceIds = new Set<string>();
  const usernames = new Set<string>();
  /** Tạo tài khoản độc lập với credential fixture mạnh đã biết, tránh dùng chung dữ liệu seed. */
  async function user(
    options: {
      email?: string;
      verified?: boolean;
      password?: string;
      status?: "ACTIVE" | "PENDING_DELETION";
    } = {},
  ) {
    const id = randomUUID();
    userIds.add(id);
    return db.user.create({
      data: {
        id,
        username: `t_${randomUUID().replaceAll("-", "").slice(0, 22)}`,
        displayName: "Nguyễn Fixture",
        passwordHash: await hashPassword(options.password ?? "Fixture passphrase 928!"),
        phone: `+849${randomInt(10000000, 100000000)}`,
        phoneVerifiedAt: new Date(),
        email: options.email,
        emailVerifiedAt: options.verified ? new Date() : null,
        status: options.status ?? "ACTIVE",
        deletionRequestedAt: options.status === "PENDING_DELETION" ? new Date() : null,
      },
    });
  }
  /** Tạo dữ liệu tham chiếu không phụ thuộc seed Province development. */
  async function province() {
    const id = randomUUID();
    provinceIds.add(id);
    return db.province.create({
      data: { id, code: randomUUID().slice(0, 20), name: "Fixture Province" },
    });
  }
  /** Chỉ xóa đồ thị của fixture này theo thứ tự an toàn FK; không reset hoặc truncate database. */
  async function cleanup(): Promise<void> {
    try {
      const created = await db.user.findMany({
        where: {
          OR: [
            { username: { in: [...usernames] } },
            {
              googleAccount: {
                googleSubject: {
                  in: [...googleCredentials.values()].map((identity) => identity.subject),
                },
              },
            },
          ],
        },
        select: { id: true },
      });
      for (const user of created) userIds.add(user.id);
      const ids = [...userIds];
      const listings = await db.listing.findMany({
        where: { ownerId: { in: ids } },
        select: { id: true },
      });
      const listingIds = listings.map((row) => row.id);
      const conversations = await db.conversation.findMany({
        where: { OR: [{ initiatorId: { in: ids } }, { listingId: { in: listingIds } }] },
        select: { id: true },
      });
      const conversationIds = conversations.map((row) => row.id);
      await db.notification.deleteMany({
        where: { OR: [{ recipientId: { in: ids } }, { conversationId: { in: conversationIds } }] },
      });
      await db.conversationParticipant.deleteMany({
        where: { conversationId: { in: conversationIds } },
      });
      await db.listingCardSnapshot.deleteMany({
        where: { conversationId: { in: conversationIds } },
      });
      await db.message.deleteMany({ where: { conversationId: { in: conversationIds } } });
      await db.transactionProposal.deleteMany({
        where: { OR: [{ proposerId: { in: ids } }, { conversationId: { in: conversationIds } }] },
      });
      await db.mediaAsset.updateMany({
        where: { chatConversationId: { in: conversationIds } },
        data: { chatConversationId: null },
      });
      await db.conversation.deleteMany({ where: { id: { in: conversationIds } } });
      await db.user.updateMany({ where: { id: { in: ids } }, data: { avatarMediaId: null } });
      await db.mediaAsset.deleteMany({ where: { uploadedById: { in: ids } } });
      await db.listingFollow.deleteMany({
        where: { OR: [{ userId: { in: ids } }, { listingId: { in: listingIds } }] },
      });
      await db.listing.deleteMany({ where: { id: { in: listingIds } } });
      await db.userFollow.deleteMany({
        where: { OR: [{ followerId: { in: ids } }, { followingId: { in: ids } }] },
      });
      await db.userBlock.deleteMany({
        where: { OR: [{ blockerId: { in: ids } }, { blockedId: { in: ids } }] },
      });
      await db.googleAccount.deleteMany({ where: { userId: { in: ids } } });
      await db.authSession.deleteMany({ where: { userId: { in: ids } } });
      await db.otpChallenge.deleteMany({ where: { userId: { in: ids } } });
      const events = await db.outboxEvent.findMany({
        where: { aggregateId: { in: [...ids, ...listingIds, ...conversationIds] } },
        select: { id: true },
      });
      await db.processedEvent.deleteMany({
        where: { eventId: { in: events.map((row) => row.id) } },
      });
      await db.outboxEvent.deleteMany({ where: { id: { in: events.map((row) => row.id) } } });
      await db.user.deleteMany({ where: { id: { in: ids } } });
      await db.province.deleteMany({ where: { id: { in: [...provinceIds] } } });
      const client = createClient({ url: redisUrl });
      client.on("error", () => {});
      await client.connect();
      try {
        for await (const keys of client.scanIterator({ MATCH: prefix + "*", COUNT: 100 }))
          if (keys.length) await client.del(keys);
      } finally {
        client.destroy();
      }
    } finally {
      await redis.close();
      await db.$disconnect();
    }
  }
  return {
    ...module,
    app,
    db,
    config,
    sms,
    email,
    googleCredentials,
    prefix,
    userIds,
    usernames,
    user,
    province,
    dispose: cleanup,
    objects,
    deletedKeys,
    failures,
  };
}
