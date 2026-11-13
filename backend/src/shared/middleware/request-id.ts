import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Phản hồi UUID có giới hạn hoặc sinh ID mới trước khi middleware có thể lỗi. */
export const requestId: RequestHandler = (request, response, next) => {
  const incoming = request.get("X-Request-ID");
  request.requestId = incoming && uuidPattern.test(incoming) ? incoming : randomUUID();
  response.setHeader("X-Request-ID", request.requestId);
  next();
};
