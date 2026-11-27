import type { DatabaseTransaction } from "../../shared/database/prisma";
import { AppError } from "../../shared/errors/app-error";
import { transactionListing, hideAcceptedListing } from "./listing.repository";

/** Giao diện công khai hẹp cho Chat; caller giữ User→Listing lock và transaction proposal. */
export async function acceptListingTransaction(
  listingId: string,
  ownerId: string,
  tx: DatabaseTransaction,
): Promise<void> {
  const listing = await transactionListing(listingId, tx);
  if (!listing || listing.ownerId !== ownerId || listing.status !== "ACTIVE")
    throw new AppError(409, "LISTING_NOT_ACTIVE", "Listing is not active.");
  if (listing.type === "RENT") return;
  if (listing.version === 2147483647)
    throw new AppError(409, "LISTING_VERSION_CONFLICT", "Listing version limit reached.");
  await hideAcceptedListing(listingId, tx);
}
