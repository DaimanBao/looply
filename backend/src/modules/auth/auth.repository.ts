import type { PrismaClient, Prisma, User } from "../../generated/prisma/client";
import type { DatabaseTransaction } from "../../shared/database/prisma";
import { lockResources } from "../../shared/database/locks";
import { emailTrimCharacters } from "./credentials/email-normalization";

export class AuthRepository {
  /** Uses the shared Prisma pool; services pass transaction clients explicitly. */
  constructor(private readonly db: PrismaClient) {}
  /** Keeps all credential/session mutations within the caller's atomic unit of work. */
  transaction<T>(run: (tx: DatabaseTransaction) => Promise<T>): Promise<T> { return this.db.$transaction(run, { timeout: 15000 }); }
  /** Serializes sessions and credential changes with User/account mutations. */
  lock(tx: DatabaseTransaction, userId: string, extra: string[] = []): Promise<void> { return lockResources(tx, [`user:${userId.toLowerCase()}`, ...extra]); }
  /** Locks the email identity first, then all affected Users in UUID order before invalidating shared declarations. */
  async lockContact(tx: DatabaseTransaction, userId: string, destination: string): Promise<void> {
    if (!destination.includes("@")) { await this.lock(tx, userId, [`phone:${destination}`]); return; }
    await lockResources(tx, [`email:${destination}`]);
    const declarations = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM users WHERE "emailVerifiedAt" IS NULL AND lower(btrim(email, ${emailTrimCharacters}))=${destination}`;
    await lockResources(tx, [...declarations.map((user) => `user:${user.id}`), `user:${userId.toLowerCase()}`]);
  }
  /** Finds a unique internal identifier; email is deliberately excluded from unique lookups. */
  user(where: Prisma.UserWhereUniqueInput, tx: DatabaseTransaction = this.db): Promise<User | null> { return tx.user.findUnique({ where }); }
  /** Resolves only verified owned contacts for reset, phone login or account linking. */
  async contact(destination: string, tx: DatabaseTransaction = this.db): Promise<User | null> {
    if (!destination.includes("@")) return tx.user.findFirst({ where: { phone: destination, phoneVerifiedAt: { not: null } } });
    const rows = await tx.$queryRaw<User[]>`SELECT * FROM users WHERE "emailVerifiedAt" IS NOT NULL AND lower(btrim(email, ${emailTrimCharacters})) = ${destination} LIMIT 1`;
    return rows[0] ?? null;
  }
  /** Looks up Google exclusively by provider subject, never by a client-supplied email. */
  google(subject: string, tx: DatabaseTransaction = this.db) { return tx.googleAccount.findUnique({ where: { googleSubject: subject }, include: { user: true } }); }
  /** Resolves the linked subject for re-authentication. */
  googleForUser(userId: string, tx: DatabaseTransaction = this.db) { return tx.googleAccount.findUnique({ where: { userId } }); }
  /** Requires an active catalog entry before internal signup. */
  province(code: string, tx: DatabaseTransaction = this.db) { return tx.province.findFirst({ where: { code, isActive: true } }); }
  /** Creates a User with the already-verified credential/profile inputs from signup. */
  createUser(data: Prisma.UserUncheckedCreateInput, tx: DatabaseTransaction) { return tx.user.create({ data }); }
  /** Creates the one Google identity per User under unique subject and User constraints. */
  linkGoogle(userId: string, subject: string, tx: DatabaseTransaction) { return tx.googleAccount.create({ data: { userId, googleSubject: subject } }); }
  /** Persists only a refresh digest, never the bearer token. */
  createSession(userId: string, refreshTokenHash: string, expiresAt: Date, tx: DatabaseTransaction) {
    return tx.authSession.create({ data: { userId, refreshTokenHash, expiresAt } });
  }
  /** Resolves a refresh token or access-token session with its current account state. */
  session(where: Prisma.AuthSessionWhereUniqueInput, tx: DatabaseTransaction = this.db) { return tx.authSession.findUnique({ where, include: { user: true } }); }
  /** Makes refresh compare-and-swap atomic even if two requests arrive with the same cookie. */
  rotate(id: string, oldHash: string, newHash: string, tx: DatabaseTransaction) {
    return tx.authSession.updateMany({ where: { id, refreshTokenHash: oldHash, revokedAt: null, expiresAt: { gt: new Date() } }, data: { refreshTokenHash: newHash, tokenVersion: { increment: 1 }, lastUsedAt: new Date() } });
  }
  /** Revokes a User's sessions, optionally retaining the password-change caller's session. */
  revoke(userId: string, tx: DatabaseTransaction, except?: string) { return tx.authSession.updateMany({ where: { userId, revokedAt: null, ...(except ? { id: { not: except } } : {}) }, data: { revokedAt: new Date() } }); }
  /** Idempotently revokes only the caller-owned session. */
  revokeOne(userId: string, id: string) { return this.db.authSession.updateMany({ where: { id, userId, revokedAt: null }, data: { revokedAt: new Date() } }); }
  /** Returns only safe session metadata, excluding refresh digests and token versions. */
  sessions(userId: string) { return this.db.authSession.findMany({ where: { userId, revokedAt: null, expiresAt: { gt: new Date() } }, select: { id: true, createdAt: true, lastUsedAt: true, expiresAt: true }, orderBy: { createdAt: "desc" } }); }
  /** Updates password material inside the same transaction as revocation. */
  password(userId: string, passwordHash: string, tx: DatabaseTransaction) { return tx.user.update({ where: { id: userId }, data: { passwordHash } }); }
  /** Erases Auth-owned credentials only inside the deletion coordinator's transaction. */
  async erase(userId: string, tx: DatabaseTransaction): Promise<void> {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    await tx.authSession.deleteMany({ where: { userId } }); await tx.googleAccount.deleteMany({ where: { userId } });
    await tx.otpChallenge.deleteMany({ where: { OR: [{ userId }, ...(user.email ? [{ destination: user.email }] : []), ...(user.phone ? [{ destination: user.phone }] : [])] } });
    await tx.user.update({ where: { id: userId }, data: { passwordHash: null, email: null, emailVerifiedAt: null, phone: null, phoneVerifiedAt: null } });
  }
  /** Verifies ownership atomically and clears conflicting unverified declarations. */
  async verifiedContact(userId: string, destination: string, tx: DatabaseTransaction): Promise<void> {
    if (destination.includes("@")) {
      await tx.$executeRaw`UPDATE users SET email=NULL, "updatedAt"=NOW() WHERE "emailVerifiedAt" IS NULL AND id<>${userId}::uuid AND lower(btrim(email, ${emailTrimCharacters}))=${destination}`;
      await tx.user.update({ where: { id: userId }, data: { email: destination, emailVerifiedAt: new Date() } });
    } else {
      await tx.user.update({ where: { id: userId }, data: { phone: destination, phoneVerifiedAt: new Date() } });
    }
  }
}
