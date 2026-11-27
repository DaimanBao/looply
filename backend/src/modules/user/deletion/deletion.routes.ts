import { Router } from "express";
import type { SessionService } from "../../auth";
import { authenticate } from "../../auth";
import type { createDeletionController } from "./deletion.controller";

/** Chỉ nối phân quyền hạn chế của tài khoản chờ xóa vào endpoint hủy. */
export function createDeletionRouter(
  controller: ReturnType<typeof createDeletionController>,
  sessions: SessionService,
): Router {
  const router = Router();
  router.post("/users/me/deletion", authenticate(sessions), controller.request);
  router.delete("/users/me/deletion", authenticate(sessions, { pending: true }), controller.cancel);
  return router;
}
