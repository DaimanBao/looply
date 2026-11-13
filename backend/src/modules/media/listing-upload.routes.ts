import { Router } from "express";
import { authenticate, type SessionService } from "../auth";
import { noStore } from "../../shared/middleware/no-store";
import { listingUploadBytes, requireListingBytes, validateMediaId } from "./listing-media.middleware";
import type { createListingUploadController } from "./listing-upload.controller";

/** Registers private upload endpoints, reusing the existing authentication gate. */
export function createListingUploadRouter(controller: ReturnType<typeof createListingUploadController>, sessions: SessionService): Router {
  const router = Router(); const active = authenticate(sessions);
  router.use("/media/listing-uploads", noStore);
  router.post("/media/listing-uploads", active, listingUploadBytes, requireListingBytes, controller.upload);
  router.delete("/media/listing-uploads/:mediaId", active, validateMediaId, controller.cancel);
  return router;
}
