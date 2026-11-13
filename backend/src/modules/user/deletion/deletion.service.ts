import type { IdentityService, Principal, SessionService } from "../../auth";
import type { DeletionRepository } from "./deletion.repository";
import { conflict, forbidden } from "../../auth";

export class DeletionService {
  /** Uses Auth-owned proofs and current sessions rather than trusting client verification flags. */
  constructor(private readonly repository: DeletionRepository, private readonly sessions: SessionService, private readonly identity: IdentityService) {}
  /** Schedules a 30-day deletion and revokes every session, including the requester, without touching Listing/Media. */
  async request(principal: Principal, proof: string): Promise<void> {
    await this.identity.consumeReauth(principal, "DELETE_ACCOUNT", proof);
    await this.repository.transaction(async (tx) => {
      await this.repository.lock(principal.userId, tx); await this.sessions.requireCurrent(principal, tx);
      await this.repository.request(principal.userId, tx);
      await this.sessions.revokeAll(principal.userId, tx);
    });
  }
  /** Requires a fresh restricted login and explicit DELETE request; never cancels from login itself. */
  async cancel(principal: Principal): Promise<void> {
    await this.repository.transaction(async (tx) => {
      await this.repository.lock(principal.userId, tx);
      const user = await this.sessions.requireCurrent(principal, tx, false);
      if (user.status !== "PENDING_DELETION") throw forbidden();
      if ((await this.repository.cancel(user.id, tx)).count !== 1) throw conflict("Deletion has already started.");
    });
  }
}
