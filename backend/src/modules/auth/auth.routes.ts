import { Router } from "express";
import type { SessionService } from "./sessions/session.service";
import type { EphemeralAuth } from "./redis/ephemeral-auth";
import type { AuthController } from "./http/auth.controller";
import { linkGoogleSchema } from "./http/auth.controller";
import { authenticate } from "./http/auth.middleware";
import { authenticationLimit } from "./http/auth-limit";
import { cookieOrigin } from "./http/cookie-origin";
import { validateBody } from "../../shared/middleware/validate-request";
import { noStore } from "../../shared/middleware/no-store";
import { validateSessionId } from "./http/auth.validation";
import { registerSchema, passwordLoginSchema, phoneLoginSchema, googleSchema, requestOtpSchema, reauthSchema, resetSchema } from "./auth.schema";

/** Wires imported middleware and controllers without embedding validation or authentication logic. */
export function createAuthRouter(controller: AuthController, sessions: SessionService, ephemeral: EphemeralAuth, origins: string[]): Router {
  const router = Router(); const active = authenticate(sessions); const optional = authenticate(sessions, { optional: true });
  router.use("/auth", noStore, authenticationLimit(ephemeral));
  router.post("/auth/register", validateBody(registerSchema), controller.register);
  router.post("/auth/login/password", validateBody(passwordLoginSchema), controller.passwordLogin);
  router.post("/auth/login/phone", validateBody(phoneLoginSchema), controller.phoneLogin);
  router.post("/auth/google/challenge", optional, controller.googleChallenge);
  router.post("/auth/login/google", validateBody(googleSchema), controller.googleLogin);
  router.post("/auth/google/link", active, validateBody(linkGoogleSchema), controller.googleLink);
  router.post("/auth/otp/request", optional, validateBody(requestOtpSchema), controller.requestOtp);
  router.post("/auth/refresh", cookieOrigin(origins), controller.refresh);
  router.post("/auth/logout", cookieOrigin(origins), controller.logout);
  router.post("/auth/reauthenticate", active, validateBody(reauthSchema), controller.reauthenticate);
  router.post("/auth/password/reset", validateBody(resetSchema), controller.reset);
  router.get("/auth/sessions", active, controller.list);
  router.delete("/auth/sessions/:sessionId", active, validateSessionId, controller.revoke);
  return router;
}
