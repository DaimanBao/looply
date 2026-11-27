import { randomUUID } from "node:crypto";
import type { Principal } from "../auth";
import type { ChatMediaService } from "../media";
import { acceptListingTransaction } from "../listing";
import { lockResources } from "../../shared/database/locks";
import { AppError } from "../../shared/errors/app-error";
import type { ChatAccess } from "./chat-access";
import type { ChatEvents } from "./chat-events";
import type { ChatRetention } from "./chat-retention.service";
import type { ProposalInput } from "./chat.schema";
import { payloadHash, snapshotExpiry } from "./chat-policy";
import { messageDto } from "./chat.dto";

export class ProposalService {
  /** Điều phối card, snapshot và Listing dưới cùng thứ tự khóa, copy storage ngoài transaction. */
  constructor(
    private readonly access: ChatAccess,
    private readonly media: ChatMediaService,
    private readonly retention: ChatRetention,
    private readonly events: ChatEvents,
  ) {}

  /** Chuẩn bị ảnh riêng trước khi tạo proposal; retry không tạo card hoặc ảnh lịch sử thứ hai. */
  async create(principal: Principal, id: string, input: ProposalInput) {
    const repository = this.access.repository;
    const hash = payloadHash(["TRANSACTION_CARD", input.kind, input.proposedPrice ?? null]);
    const preparation = await this.access.withConversation(principal, id, async (row, tx) => {
      const old = await repository.replay(id, principal.userId, input.requestId, tx);
      if (old) {
        if (old.payloadHash !== hash)
          throw new AppError(409, "REQUEST_CONFLICT", "Use a new requestId.");
        return { kind: "replay" as const, message: messageDto(old, row, await repository.now(tx)) };
      }
      await this.access.writable(row, tx);
      const listing = row.listingId ? await repository.listing(row.listingId, tx) : null;
      if (
        !listing ||
        listing.ownerId === principal.userId ||
        row.contactUserId !== principal.userId
      )
        throw new AppError(403, "PROPOSAL_NOT_ALLOWED", "Only the listing contact can propose.");
      if (listing.status !== "ACTIVE")
        throw new AppError(409, "LISTING_NOT_ACTIVE", "Listing is not active.");
      if (await repository.pending(id, tx))
        throw new AppError(409, "PROPOSAL_PENDING", "Resolve the pending proposal first.");
      if ((listing.type === "EXCHANGE") !== (input.kind === "EXCHANGE_CONTACT"))
        throw new AppError(
          400,
          "INVALID_PROPOSAL_KIND",
          "Choose a proposal matching the listing type.",
        );
      const source = listing.media[0];
      if (!source || source.type !== "IMAGE")
        throw new AppError(409, "COVER_UNAVAILABLE", "Listing cover is unavailable.");
      await lockResources(tx, [`media:${source.id}`]);
      const now = await repository.now(tx);
      const snapshotId = randomUUID();
      const snapshot = await repository.reserveSnapshot(
        {
          id: snapshotId,
          conversationId: id,
          listingId: listing.id,
          title: listing.title,
          type: listing.type,
          listedPrice: listing.price,
          rentalUnit: listing.rentalUnit,
          sourceMediaId: source.id,
          sourceListingVersion: listing.version,
          imageStorageKey: `chat-snapshot/${snapshotId}.webp`,
          createdAt: now,
        },
        tx,
      );
      return { kind: "prepared" as const, snapshot, source };
    });
    if (preparation.kind === "replay") return preparation.message;
    const { snapshot, source } = preparation;
    try {
      const size = await this.media.copySnapshot(source, snapshot.id);
      const result = await this.access.withConversation(principal, id, async (row, tx) => {
        const old = await repository.replay(id, principal.userId, input.requestId, tx);
        if (old) {
          if (old.payloadHash !== hash)
            throw new AppError(409, "REQUEST_CONFLICT", "Use a new requestId.");
          await this.retention.revoke(snapshot.id, id, await repository.now(tx), tx);
          return { message: messageDto(old, row, await repository.now(tx)), created: false };
        }
        await this.access.writable(row, tx);
        const listing = row.listingId ? await repository.listing(row.listingId, tx) : null;
        await lockResources(tx, [`media:${source.id}`]);
        const current = await repository.snapshot(snapshot.id, tx);
        let now = await repository.now(tx);
        if (
          !current ||
          current.imageState !== "PREPARING" ||
          current.createdAt.getTime() + 900_000 <= now.getTime() ||
          !listing ||
          listing.status !== "ACTIVE" ||
          listing.version !== current.sourceListingVersion ||
          listing.media[0]?.id !== current.sourceMediaId
        )
          throw new AppError(
            409,
            "SNAPSHOT_CHANGED",
            "Listing or upload changed; retry the proposal.",
          );
        if (await repository.pending(id, tx))
          throw new AppError(409, "PROPOSAL_PENDING", "Resolve the pending proposal first.");
        now = await repository.now(tx);
        if (current.createdAt.getTime() + 900_000 <= now.getTime())
          throw new AppError(409, "SNAPSHOT_CHANGED", "Snapshot preparation expired; retry.");
        await this.retention.retire(row, now, tx);
        const proposal = await repository.proposal(
          {
            conversationId: id,
            listingId: listing.id,
            proposerId: principal.userId,
            type: listing.type,
            proposalKind: input.kind,
            listedPriceSnapshot: listing.price,
            proposedPrice:
              input.kind === "EXCHANGE_CONTACT" ? null : (input.proposedPrice ?? listing.price),
            rentalUnit: listing.rentalUnit,
            createdCycle: listing.activeCycle,
            createdAt: now,
          },
          tx,
        );
        const message = await repository.insertMessage(
          {
            conversationId: id,
            senderId: principal.userId,
            requestId: input.requestId,
            type: "TRANSACTION_CARD",
            proposalId: proposal.id,
            payloadHash: hash,
            createdAt: now,
          },
          tx,
        );
        if ((await repository.publishSnapshot(snapshot.id, message.id, size, now, tx)) !== 1)
          throw new AppError(409, "SNAPSHOT_CHANGED", "Snapshot preparation expired; retry.");
        await repository.activity(
          id,
          new Date(Math.max(now.getTime(), row.lastActivityAt.getTime())),
          true,
          tx,
        );
        await repository.restore(id, tx);
        await repository.event(
          id,
          "chat.message.created",
          {
            conversationId: id,
            messageId: message.id,
            senderId: principal.userId,
            recipientId: listing.ownerId,
          },
          tx,
        );
        return {
          message: messageDto(
            (await repository.message(message.id, tx))!,
            { ...row, lastActivityAt: now },
            now,
          ),
          created: true,
        };
      });
      if (result.created) await this.events.changed(id);
      return result.message;
    } catch (error) {
      await repository.transaction(async (tx) => {
        await lockResources(tx, [`conversation:${id}`]);
        const current = await repository.snapshot(snapshot.id, tx);
        if (current && current.imageState !== "AVAILABLE") {
          await this.retention.revoke(snapshot.id, id, await repository.now(tx), tx);
        }
      });
      throw error instanceof AppError
        ? error
        : new AppError(503, "MEDIA_UNAVAILABLE", "Could not prepare listing card.");
    }
  }

  /** Chủ Listing xử lý card một lần; unique acceptedCycle và Listing lock ngăn accept xung đột. */
  async resolve(
    principal: Principal,
    id: string,
    proposalId: string,
    status: "ACCEPTED" | "REJECTED",
  ) {
    const result = await this.access.withConversation(principal, id, async (row, tx) => {
      const repository = this.access.repository;
      const card = await repository.proposalCard(proposalId, tx);
      if (!card || card.conversationId !== id || !card.proposal)
        throw new AppError(404, "NOT_FOUND", "Proposal not found.");
      const listing = row.listing;
      if (!listing || listing.ownerId !== principal.userId)
        throw new AppError(
          403,
          "PROPOSAL_NOT_ALLOWED",
          "Only the listing owner can resolve proposals.",
        );
      if (card.proposal.status !== "PENDING") {
        if (card.proposal.status !== status)
          throw new AppError(409, "PROPOSAL_RESOLVED", "Proposal has already been resolved.");
        return { message: messageDto(card, row, await repository.now(tx)), changed: false };
      }
      await this.access.writable(row, tx);
      if (listing.status !== "ACTIVE")
        throw new AppError(409, "LISTING_NOT_ACTIVE", "Listing is not active.");
      if (status === "REJECTED" && card.proposal.proposalKind !== "NEGOTIATED_PRICE")
        throw new AppError(
          403,
          "PROPOSAL_NOT_REJECTABLE",
          "Only negotiated proposals can be rejected.",
        );
      const now = await repository.now(tx);
      await this.retention.retire(row, now, tx);
      await repository.resolveProposal(
        proposalId,
        {
          status,
          resolvedAt: now,
          acceptedCycle: status === "ACCEPTED" ? listing.activeCycle : null,
        },
        tx,
      );
      if (status === "ACCEPTED") await acceptListingTransaction(listing.id, principal.userId, tx);
      await repository.activity(
        id,
        new Date(Math.max(now.getTime(), row.lastActivityAt.getTime())),
        false,
        tx,
      );
      await repository.event(
        id,
        "chat.proposal.resolved",
        { conversationId: id, proposalId, status },
        tx,
      );
      return {
        message: messageDto(
          (await repository.proposalCard(proposalId, tx))!,
          { ...row, lastActivityAt: now },
          now,
        ),
        changed: true,
      };
    });
    if (result.changed) await this.events.changed(id);
    return result.message;
  }

  /** Membership/expiry kiểm tra trước và sau storage read để không phát bytes qua biên retention. */
  image(principal: Principal, id: string, messageId: string) {
    return this.access.withConversation(principal, id, async (row, tx) => {
      const repository = this.access.repository;
      const message = await repository.message(messageId, tx);
      const snapshot = message?.cardSnapshot;
      if (
        !message ||
        message.conversationId !== id ||
        !snapshot ||
        !snapshot.snapshotCreatedAt ||
        snapshot.imageState !== "AVAILABLE" ||
        (await repository.now(tx)) >= snapshotExpiry(snapshot.snapshotCreatedAt, row.lastActivityAt)
      )
        throw new AppError(404, "NOT_FOUND", "Snapshot image not found.");
      const bytes = await this.media.readSnapshot(snapshot.id);
      await this.access.sessions.requireCurrent(principal, tx);
      if (
        (await repository.now(tx)) >= snapshotExpiry(snapshot.snapshotCreatedAt, row.lastActivityAt)
      )
        throw new AppError(404, "NOT_FOUND", "Snapshot image not found.");
      return bytes;
    });
  }
}
