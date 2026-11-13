import { Router } from "express";
import { authenticate, type SessionService } from "../auth";
import { noStore } from "../../shared/middleware/no-store";
import { validateBody } from "../../shared/middleware/validate-request";
import {
  createListingSchema,
  patchListingSchema,
  visibilitySchema,
  deleteListingSchema,
} from "./listing.schema";
import { validateListingId, validateMyListings, validateListingMedia } from "./listing.validation";
import type { createListingController } from "./listing.controller";

/** Đăng ký route quản lý/chi tiết sau các route khám phá có đường dẫn cố định. */
export function createListingRouter(
  controller: ReturnType<typeof createListingController>,
  sessions: SessionService,
  discovery: Router,
): Router {
  const router = Router();
  const active = authenticate(sessions);
  const optional = authenticate(sessions, { optional: true });
  router.use("/listings", noStore);
  router.get("/users/me/listings", noStore, active, validateMyListings, controller.mine);
  router.use(discovery);
  router.post("/listings", active, validateBody(createListingSchema), controller.create);
  router.get("/listings/:listingId", optional, validateListingId, controller.get);
  router.patch(
    "/listings/:listingId",
    active,
    validateListingId,
    validateBody(patchListingSchema),
    controller.update,
  );
  router.patch(
    "/listings/:listingId/visibility",
    active,
    validateListingId,
    validateBody(visibilitySchema),
    controller.visibility,
  );
  router.delete(
    "/listings/:listingId",
    active,
    validateListingId,
    validateBody(deleteListingSchema),
    controller.remove,
  );
  router.get(
    "/listings/:listingId/media/:mediaId",
    optional,
    validateListingMedia,
    controller.delivery,
  );
  return router;
}
