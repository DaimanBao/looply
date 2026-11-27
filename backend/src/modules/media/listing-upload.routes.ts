import { Router } from "express";
import { authenticate, type SessionService } from "../auth";
import { noStore } from "../../shared/middleware/no-store";
import { stageListingUpload } from "./listing-staging";
import type { createListingUploadController } from "./listing-upload.controller";

/** Đăng ký endpoint upload riêng tư, tái sử dụng cổng xác thực hiện có. */
export function createListingUploadRouter(
  controller: ReturnType<typeof createListingUploadController>,
  sessions: SessionService,
): Router {
  const router = Router();
  const active = authenticate(sessions);
  router.use("/media/listing-uploads", noStore);
  router.post("/media/listing-uploads", active, stageListingUpload, controller.upload);
  router.delete("/media/listing-uploads/:mediaId", active, controller.cancel);
  return router;
}
