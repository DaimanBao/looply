import type { RequestHandler } from "express";

/** Ngăn trình duyệt/proxy cache response phụ thuộc danh tính, kể cả lỗi và proof được cấp. */
export const noStore: RequestHandler = (_request, response, next) => {
  response.setHeader("Cache-Control", "no-store");
  next();
};
