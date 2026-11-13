import type { RequestHandler } from "express";

/** Giữ response liveness tiến trình hiện có mà không truy vấn database. */
export const getHealth: RequestHandler = (_request, response) => {
  response.status(200).json({ status: "ok", service: "looply-backend" });
};
