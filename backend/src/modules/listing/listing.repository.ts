import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import type { DatabaseTransaction } from "../../shared/database/prisma";
import { lockResources } from "../../shared/database/locks";
import { visibleUserWhere } from "../user";

const projection = {
  province: { select: { code: true, name: true } },
  owner: { include: { province: { select: { code: true, name: true } }, _count: { select: { followerRelations: true, followingRelations: true } } } },
  media: { where: { status: "ATTACHED", deletedAt: null }, orderBy: [{ position: "asc" }, { id: "asc" }] },
} satisfies Prisma.ListingInclude;
export type ListingRow = Prisma.ListingGetPayload<{ include: typeof projection }>;
export class ListingRepository {
  /** Keeps persistence and shared lock mechanics outside Listing policy. */
  constructor(private readonly db: PrismaClient) {}
  /** Bounds storage readiness/delivery checks within the transaction's lock lifetime. */
  transaction<T>(run: (tx: DatabaseTransaction) => Promise<T>): Promise<T> { return this.db.$transaction(run, { timeout: 120_000 }); }
  /** Locks all involved users first, matching Auth/User/Media/account cleanup. */
  lockUsers(ids: string[], tx: DatabaseTransaction) { return lockResources(tx, ids.map((id) => `user:${id.toLowerCase()}`)); }
  /** Serializes every mutation with future Conversation creators. */
  lockListing(id: string, tx: DatabaseTransaction) { return lockResources(tx, [`listing:${id.toLowerCase()}`]); }
  /** Discovers immutable ownership only; authorization is always reread after locking. */
  owner(id: string) { return this.db.listing.findUnique({ where: { id }, select: { ownerId: true } }); }
  /** Loads the explicit projection used by DTO mapping under the caller's locks. */
  get(id: string, tx: DatabaseTransaction) { return tx.listing.findUnique({ where: { id }, include: projection }); }
  /** Applies the existing public User lifecycle/Block predicate. */
  visibleOwner(id: string, viewerId: string | undefined, tx: DatabaseTransaction) { return tx.user.findFirst({ where: { id, ...visibleUserWhere(viewerId) }, select: { id: true } }); }
  /** Resolves only active catalog entries when choosing/changing Province. */
  province(code: string, tx: DatabaseTransaction) { return tx.province.findFirst({ where: { code, isActive: true }, select: { id: true } }); }
  /** Reads interaction facts under Listing lock without mutating Chat data. */
  async interactions(listingId: string, tx: DatabaseTransaction) {
    const conversation = await tx.conversation.findFirst({ where: { listingId }, select: { id: true } });
    const accepted = await tx.transactionProposal.findFirst({ where: { listingId, status: "ACCEPTED" }, select: { id: true } });
    return { hasConversations: !!conversation, hasAcceptedProposal: !!accepted };
  }
  /** Reads an existing Follow for response projection without implementing Follow mutations. */
  followed(listingId: string, userId: string, tx: DatabaseTransaction) { return tx.listingFollow.findUnique({ where: { userId_listingId: { userId, listingId } }, select: { id: true } }); }
  /** Creates only service-selected scalar fields, preserving server defaults. */
  create(data: Prisma.ListingUncheckedCreateInput, tx: DatabaseTransaction) { return tx.listing.create({ data }); }
  /** Combines expectedVersion and ownership with the locked transition as an additional write fence. */
  update(id: string, ownerId: string, version: number, data: Prisma.ListingUpdateManyMutationInput, tx: DatabaseTransaction) { return tx.listing.updateMany({ where: { id, ownerId, version }, data }); }
  /** Uses database wall time after locks, rather than transaction-start time. */
  async now(tx: DatabaseTransaction): Promise<Date> {
    const [row] = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
    if (!row) throw new Error("Database clock unavailable"); return row.now;
  }
  /** Uses a compound keyset predicate instead of requiring the boundary row to still exist. */
  mine(ownerId: string, status: "ACTIVE" | "HIDDEN" | undefined, limit: number, asOf: Date, last: { createdAt: Date; id: string } | undefined, tx: DatabaseTransaction) {
    return tx.listing.findMany({ where: { ownerId, status: status ?? { in: ["ACTIVE", "HIDDEN"] }, deletedAt: null, createdAt: { lte: asOf }, ...(last ? { OR: [{ createdAt: { lt: last.createdAt } }, { createdAt: last.createdAt, id: { lt: last.id } }] } : {}) }, include: projection, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: limit + 1 });
  }
  /** Emits one durable fact atomically with a successful content edit; no Notification consumer is implemented. */
  event(listingId: string, version: number, tx: DatabaseTransaction) { return tx.outboxEvent.create({ data: { aggregateType: "Listing", aggregateId: listingId, eventType: "listing.updated", payload: { listingId, version } } }); }
}
