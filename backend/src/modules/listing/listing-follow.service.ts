import type { Principal, SessionService } from "../auth";
import { AppError } from "../../shared/errors/app-error";
import { ListingRepository } from "./listing.repository";
import { ListingFollowRepository } from "./listing-follow.repository";

export class ListingFollowService {
  /** Coordinates relationship persistence with existing Listing locks and the authoritative session gate. */
  constructor(private readonly listings: ListingRepository, private readonly repository: ListingFollowRepository, private readonly sessions: SessionService) {}
  /** Locks the complete User pair before Listing, then rereads every eligibility fact before an idempotent upsert. */
  async follow(id: string, principal: Principal): Promise<void> {
    const candidate = await this.listings.owner(id);
    if (!candidate) throw new AppError(404, "NOT_FOUND", "Listing not found.");
    await this.listings.transaction(async (tx) => {
      await this.listings.lockUsers([candidate.ownerId, principal.userId], tx); await this.sessions.requireCurrent(principal, tx);
      await this.listings.lockListing(id, tx); const row = await this.listings.get(id, tx);
      if (!row || row.ownerId !== candidate.ownerId || row.status !== "ACTIVE" || row.deletedAt || !await this.listings.visibleOwner(row.ownerId, principal.userId, tx)) throw new AppError(404, "NOT_FOUND", "Listing not found.");
      if (row.ownerId === principal.userId) throw new AppError(403, "SELF_INTERACTION", "Cannot follow your own listing.");
      await this.repository.follow(principal.userId, id, tx);
    });
  }
  /** Does not gate on foreign owner/state; serializes removal with follow without acquiring later User locks. */
  async unfollow(id: string, principal: Principal): Promise<void> {
    await this.listings.transaction(async (tx) => {
      await this.listings.lockUsers([principal.userId], tx); await this.sessions.requireCurrent(principal, tx);
      await this.listings.lockListing(id, tx); await this.repository.unfollow(principal.userId, id, tx);
    });
  }
}
