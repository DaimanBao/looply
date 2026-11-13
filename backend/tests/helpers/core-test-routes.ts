import { Router } from "express";
import { validateRequest } from "../../src/shared/middleware/validate-request";
import {
  echoValidated,
  failAfterHeaders,
  failAsynchronously,
  failForbidden,
  failInternally,
  failPrisma,
  failUnauthenticated,
  fixtureRequestSchema,
} from "./core-test-handlers";

/** Nối endpoint test tổng hợp; bootstrap production không import router này. */
export function createCoreTestRouter(): Router {
  const router = Router();
  router.post("/validation", validateRequest(fixtureRequestSchema), echoValidated);
  router.get("/internal", failInternally);
  router.get("/async-internal", failAsynchronously);
  router.get("/unauthenticated", failUnauthenticated);
  router.get("/forbidden", failForbidden);
  router.get("/prisma-conflict", failPrisma);
  router.get("/partial-failure", failAfterHeaders);
  return router;
}
