import { Router } from "express";
import { getHealth } from "./health.controller";

/** Wires the health endpoint to its imported handler. */
export function createHealthRouter(): Router {
  const router = Router();
  router.get("/health", getHealth);
  return router;
}
