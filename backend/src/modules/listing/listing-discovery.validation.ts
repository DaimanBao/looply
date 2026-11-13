import { z } from "zod";
import { validateRequest } from "../../shared/middleware/validate-request";
import {
  discoveryQuerySchema,
  pageQuerySchema,
  suggestionsSchema,
} from "./listing-discovery.schema";
import { listingId } from "./listing.schema";

export const validateDiscovery = validateRequest(
  z.object({ params: z.unknown(), body: z.unknown(), query: discoveryQuerySchema }),
);
export const validateSuggestions = validateRequest(
  z.object({ params: z.unknown(), body: z.unknown(), query: suggestionsSchema }),
);
export const validateFollowedPage = validateRequest(
  z.object({ params: z.unknown(), body: z.unknown(), query: pageQuerySchema }),
);
export const validateUserListings = validateRequest(
  z.object({ params: z.object({ userId: listingId }), body: z.unknown(), query: pageQuerySchema }),
);
