import type { ConversationRow, MessageRow } from "./chat.repository";
import { isAfter, snapshotExpiry } from "./chat-policy";

/** Chỉ đưa đường dẫn delivery có xác thực ra DTO, không đưa storage key hay hash. */
export function messageDto(row: MessageRow, conversation: ConversationRow, now: Date) {
  const other = conversation.participants.find((p) => p.userId !== row.senderId);
  const read = other?.lastReadMessage;
  const delivered = other?.lastDeliveredMessage;
  const snapshot = row.cardSnapshot;
  const imageAvailable =
    !!snapshot &&
    snapshot.imageState === "AVAILABLE" &&
    !!snapshot.snapshotCreatedAt &&
    now < snapshotExpiry(snapshot.snapshotCreatedAt, conversation.lastActivityAt);
  return {
    id: row.id,
    conversationId: row.conversationId,
    senderId: row.senderId,
    requestId: row.requestId,
    type: row.type,
    content: row.content,
    createdAt: row.createdAt,
    state:
      read && !isAfter(row, read)
        ? "READ"
        : delivered && !isAfter(row, delivered)
          ? "DELIVERED"
          : "SENT",
    imagePath: row.imageMediaId
      ? `/api/conversations/${row.conversationId}/messages/${row.id}/image`
      : null,
    proposal: row.proposal
      ? {
          id: row.proposal.id,
          kind: row.proposal.proposalKind,
          status: row.proposal.status,
          type: row.proposal.type,
          listedPrice: row.proposal.listedPriceSnapshot?.toFixed(0) ?? null,
          proposedPrice: row.proposal.proposedPrice?.toFixed(0) ?? null,
          rentalUnit: row.proposal.rentalUnit,
          createdCycle: row.proposal.createdCycle,
          acceptedCycle: row.proposal.acceptedCycle,
          resolvedAt: row.proposal.resolvedAt,
        }
      : null,
    snapshot: snapshot
      ? {
          listingId: snapshot.listingId,
          title: snapshot.title,
          type: snapshot.type,
          listedPrice: snapshot.listedPrice?.toFixed(0) ?? null,
          rentalUnit: snapshot.rentalUnit,
          imageAvailable,
          imagePath: imageAvailable
            ? `/api/conversations/${row.conversationId}/messages/${row.id}/snapshot`
            : null,
        }
      : null,
  };
}

/** Projection Inbox tách thông tin hiện tại của Listing khỏi snapshot lịch sử trong card. */
export function conversationDto(row: ConversationRow, userId: string, unreadCount: number) {
  const listing = row.listing;
  return {
    id: row.id,
    type: row.type,
    createdAt: row.createdAt,
    lastMessageAt: row.lastMessageAt,
    unreadCount,
    participants: row.participants.map((p) => ({
      userId: p.userId,
      displayName: p.user.displayName,
      status: p.user.status,
    })),
    hidden: !!row.participants.find((p) => p.userId === userId)?.hiddenAt,
    listing: listing
      ? {
          id: listing.id,
          ownerId: listing.ownerId,
          title: listing.title,
          type: listing.type,
          status: listing.status,
          price: listing.price?.toFixed(0) ?? null,
          rentalUnit: listing.rentalUnit,
          coverPath:
            listing.status === "ACTIVE" && listing.media[0]
              ? `/api/listings/${listing.id}/media/${listing.media[0].id}?variant=thumbnail`
              : null,
        }
      : null,
  };
}
