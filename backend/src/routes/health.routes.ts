import { Router } from "express";
import { getHealth } from "./health.controller";

/** Nối endpoint health với handler được import. */
export function createHealthRouter(): Router {
  const router = Router();
  router.get("/health", getHealth);
  return router;
}
