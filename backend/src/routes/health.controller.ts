import type { RequestHandler } from "express";

/** Preserves the existing process liveness response without issuing a database query. */
export const getHealth: RequestHandler = (_request, response) => {
  response.status(200).json({ status: "ok", service: "looply-backend" });
};
