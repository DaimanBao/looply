import type { RequestHandler } from "express";
import { z } from "zod";
import { principal } from "../auth";
import { body } from "../../shared/http/validated-body";
import type { NotificationService } from "./notification.service";
import {
  notificationId,
  notificationPage,
  notificationRead,
  notificationReadAll,
} from "./notification.schema";

/** Controller ánh xạ HTTP, không giữ query database hoặc quy tắc nghiệp vụ. */
export function createNotificationController(service: NotificationService) {
  /** Trả trang thông báo riêng tư đã qua middleware validation. */
  const list: RequestHandler = async (_request, response) => {
    const { query } = z.object({ query: notificationPage }).parse(response.locals.validated);
    response.json(await service.list(principal(response), query));
  };
  /** Trả badge tính từ Notification, độc lập unread Chat. */
  const count: RequestHandler = async (_request, response) => {
    response.json(await service.count(principal(response)));
  };
  /** Ghi nhận đúng event boundary client đã hiển thị. */
  const read: RequestHandler = async (request, response) => {
    await service.read(
      principal(response),
      notificationId.parse(request.params.notificationId),
      body(response, notificationRead).expectedEventId,
    );
    response.sendStatus(204);
  };
  /** Đánh dấu toàn bộ tới mốc server đã cấp. */
  const readAll: RequestHandler = async (_request, response) => {
    await service.readAll(
      principal(response),
      new Date(body(response, notificationReadAll).through),
    );
    response.sendStatus(204);
  };
  /** Chỉ xóa mềm dữ liệu cá nhân caller. */
  const remove: RequestHandler = async (request, response) => {
    await service.remove(principal(response), notificationId.parse(request.params.notificationId));
    response.sendStatus(204);
  };
  /** Resolve đích có quyền trước khi UI điều hướng. */
  const target: RequestHandler = async (request, response) => {
    response.json(
      await service.target(
        principal(response),
        notificationId.parse(request.params.notificationId),
      ),
    );
  };
  return { list, count, read, readAll, remove, target };
}
