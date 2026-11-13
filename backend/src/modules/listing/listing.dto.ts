import { publicProfile } from "../user";
import type { ListingRow } from "./listing.repository";

/** Serializes only API fields, keeping Decimal exact and object storage keys private. */
export function listingItem(row: ListingRow, isFollowed = false) {
  const cover = listingMedia(row).find((asset) => asset.isCover && asset.type === "IMAGE");
  if (!cover) throw new Error("Listing cover invariant violated");
  return { id: row.id, title: row.title, type: row.type, status: row.status, price: row.price?.toFixed(0) ?? null, rentalUnit: row.rentalUnit, province: row.province, owner: publicProfile(row.owner), cover, isFollowed, createdAt: row.createdAt, updatedAt: row.updatedAt };
}
/** Maps deterministic authenticated delivery paths without leaking internal metadata. */
function listingMedia(row: ListingRow) {
  return row.media.map((asset) => ({ id: asset.id, type: asset.type, mimeType: asset.mimeType, sizeBytes: asset.sizeBytes.toString(), durationSeconds: asset.durationSeconds, position: asset.position, isCover: asset.isCover, deliveryPath: `/api/listings/${row.id}/media/${asset.id}` }));
}
/** Interaction facts are disclosed only to the owner by the service. */
export function listingDetail(row: ListingRow, facts: { hasConversations: boolean; hasAcceptedProposal: boolean }, isFollowed: boolean) {
  return { ...listingItem(row, isFollowed), description: row.description, contactPhone: row.contactPhone, media: listingMedia(row), version: row.version, activeCycle: row.activeCycle, ...facts };
}
