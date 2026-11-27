import { Router } from "express";
import { authenticate, type SessionService } from "../auth";
import { noStore } from "../../shared/middleware/no-store";
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
  router.get("/users/me/listings", noStore, active, controller.mine);
  router.use(discovery);
  router.post("/listings", active, controller.create);
  router.get("/listings/:listingId", optional, controller.get);
  router.patch("/listings/:listingId", active, controller.update);
  router.patch("/listings/:listingId/visibility", active, controller.visibility);
  router.delete("/listings/:listingId", active, controller.remove);
  router.get("/listings/:listingId/media/:mediaId", optional, controller.delivery);
  return router;
}
