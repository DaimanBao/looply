import { z } from "zod";
import { validateRequest } from "../../shared/middleware/validate-request";
import { listingId, myListingsSchema } from "./listing.schema";

export const validateListingId = validateRequest(
  z.object({ params: z.object({ listingId }), query: z.unknown(), body: z.unknown() }),
);
export const validateMyListings = validateRequest(
  z.object({ params: z.unknown(), query: myListingsSchema, body: z.unknown() }),
);
export const validateListingMedia = validateRequest(
  z.object({
    params: z.object({ listingId, mediaId: listingId }),
    query: z.strictObject({ variant: z.enum(["detail", "thumbnail", "original"]).optional() }),
    body: z.unknown(),
  }),
);
