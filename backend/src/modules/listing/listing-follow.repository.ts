import type { DatabaseTransaction } from "../../shared/database/prisma";

export class ListingFollowRepository {
  /** Retains the existing unique relationship and returns successful duplicate follows without extra side effects. */
  follow(userId: string, listingId: string, tx: DatabaseTransaction) { return tx.listingFollow.upsert({ where: { userId_listingId: { userId, listingId } }, create: { userId, listingId }, update: {} }); }
  /** Deletes only the authenticated user's relation, regardless of current Listing visibility or existence. */
  unfollow(userId: string, listingId: string, tx: DatabaseTransaction) { return tx.listingFollow.deleteMany({ where: { userId, listingId } }); }
}
