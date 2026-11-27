import { Router } from "express";
import type { SessionService } from "./session.service";
import type { EphemeralAuth } from "./redis/ephemeral-auth";
import type { AuthController } from "./http/auth.controller";
import { authenticate } from "./http/auth.middleware";
import { authenticationLimit } from "./http/auth-limit";
import { cookieOrigin } from "./http/cookie-origin";
import { noStore } from "../../shared/middleware/no-store";

/** Kết nối middleware và controller được import, không nhúng logic validation hoặc xác thực. */
export function createAuthRouter(
  controller: AuthController,
  sessions: SessionService,
  ephemeral: EphemeralAuth,
  origins: string[],
): Router {
  const router = Router();
  const active = authenticate(sessions);
  const optional = authenticate(sessions, { optional: true });
  router.use("/auth", noStore, authenticationLimit(ephemeral));
  router.post("/auth/register", controller.register);
  router.post("/auth/login/password", controller.passwordLogin);
  router.post("/auth/login/phone", controller.phoneLogin);
  router.post("/auth/google/challenge", optional, controller.googleChallenge);
  router.post("/auth/login/google", controller.googleLogin);
  router.post("/auth/google/link", active, controller.googleLink);
  router.post("/auth/otp/request", optional, controller.requestOtp);
  router.post("/auth/refresh", cookieOrigin(origins), controller.refresh);
  router.post("/auth/logout", cookieOrigin(origins), controller.logout);
  router.post("/auth/reauthenticate", active, controller.reauthenticate);
  router.post("/auth/password/reset", controller.reset);
  router.get("/auth/sessions", active, controller.list);
  router.delete("/auth/sessions/:sessionId", active, controller.revoke);
  return router;
}
