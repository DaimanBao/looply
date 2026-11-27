import { Router } from "express";
import { authenticate, type SessionService } from "../auth";
import { noStore } from "../../shared/middleware/no-store";
import type { createListingDiscoveryController } from "./listing-discovery.controller";

/** Gắn sau My Listings và trước detail có tham số để me và suggestions không bị đọc thành UUID. */
export function createListingDiscoveryRouter(
  controller: ReturnType<typeof createListingDiscoveryController>,
  sessions: SessionService,
): Router {
  const router = Router();
  const optional = authenticate(sessions, { optional: true });
  const active = authenticate(sessions);
  router.get("/listings", noStore, optional, controller.search);
  router.get("/listings/suggestions", noStore, optional, controller.suggestions);
  router.get("/users/me/followed-listings", noStore, active, controller.followed);
  router.get("/users/:userId/listings", noStore, optional, controller.userListings);
  router.put("/listings/:listingId/follow", noStore, active, controller.follow);
  router.delete("/listings/:listingId/follow", noStore, active, controller.unfollow);
  return router;
}
