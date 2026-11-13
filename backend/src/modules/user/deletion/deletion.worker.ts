import { z } from "zod";
import type { DeletionRepository } from "./deletion.repository";
import type { CleanupRepository, CleanupEvent } from "../../../jobs";
import type { CredentialService, SessionService } from "../../auth";
import type { MediaCleanupService } from "../../media";

export class AccountCleanup {
  /** Keeps nontransactional object deletion outside database transactions and resumes by existing lifecycle/media state. */
  constructor(private readonly accounts: DeletionRepository, private readonly jobs: CleanupRepository, private readonly media: MediaCleanupService, private readonly credentials: CredentialService, private readonly sessions: SessionService) {}
  /** Processes one event; errors become durable retries instead of false DELETED success. */
  async runOnce(): Promise<boolean> {
    const event = await this.jobs.claim();
    if (!event) { await this.media.expired(); return false; }
    try {
      if (event.eventType === "account.delete") await this.deleteAccount(event);
      else await this.media.detached(z.object({ mediaId: z.uuid() }).parse(event.payload).mediaId, event.aggregateId);
      await this.jobs.complete(event);
    } catch { await this.jobs.fail(event); }
    return true;
  }
  /** Confirms the exact request before irreversible transition; stale cancellation events cannot delete a later account request. */
  private async deleteAccount(event: CleanupEvent): Promise<void> {
    const requestedAt = new Date(z.object({ requestedAt: z.iso.datetime() }).parse(event.payload).requestedAt);
    const run = await this.accounts.transaction(async (tx) => {
      await this.accounts.lock(event.aggregateId, tx);
      if (!await this.jobs.current(event, tx)) return false;
      let user = await this.accounts.user(event.aggregateId, tx);
      if (!user || user.status === "ACTIVE") return false;
      if (user.status === "PENDING_DELETION") {
        if ((await this.accounts.start(user.id, requestedAt, tx)).count !== 1) return false;
        user = await this.accounts.user(user.id, tx);
      }
      if (!user || (user.status === "DELETING" && user.deletionRequestedAt?.getTime() !== requestedAt.getTime())) return false;
      await this.accounts.prepare(user.id, tx);
      await this.media.prepareAccount(user.id, tx);
      await this.sessions.revokeAll(user.id, tx); return true;
    });
    if (!run) return;
    await this.media.account(event.aggregateId);
    await this.accounts.transaction(async (tx) => {
      await this.accounts.lock(event.aggregateId, tx);
      const current = await this.accounts.user(event.aggregateId, tx);
      if (!current || !["DELETING", "DELETED"].includes(current.status)) throw new Error("Invalid cleanup state");
      await this.media.assertAccountClean(current.id, tx);
      await this.credentials.eraseForDeletion(current.id, tx);
      await this.accounts.finish(current.id, tx);
    });
  }
}
