import type { RequestHandler } from "express";
import { z } from "zod";
import { principal } from "../auth";
import { parseRequest, validatedHandler } from "../../shared/middleware/validate-request";
import type { NotificationService } from "./notification.service";
import {
  notificationId,
  notificationPage,
  notificationRead,
  notificationReadAll,
} from "./notification.schema";

/** Controller ánh xạ HTTP, không giữ query database hoặc quy tắc nghiệp vụ. */
export function createNotificationController(service: NotificationService) {
  const byId = z.object({
    params: z.object({ notificationId }),
    query: z.strictObject({}),
  });
  const readBody = z.object({ body: notificationRead });
  /** Trả trang thông báo riêng tư đã qua middleware validation. */
  const list = validatedHandler(
    z.object({ query: notificationPage }),
    async ({ query }, response) => {
      response.json(await service.list(principal(response), query));
    },
  );
  /** Trả badge tính từ Notification, độc lập unread Chat. */
  const count: RequestHandler = async (_request, response) => {
    response.json(await service.count(principal(response)));
  };
  /** Ghi nhận đúng event boundary client đã hiển thị. */
  const read = validatedHandler(byId, async ({ params }, response, request) => {
    const { body } = parseRequest(readBody, request);
    await service.read(principal(response), params.notificationId, body.expectedEventId);
    response.sendStatus(204);
  });
  /** Đánh dấu toàn bộ tới mốc server đã cấp. */
  const readAll = validatedHandler(
    z.object({ body: notificationReadAll }),
    async ({ body }, response) => {
      await service.readAll(principal(response), new Date(body.through));
      response.sendStatus(204);
    },
  );
  /** Chỉ xóa mềm dữ liệu cá nhân caller. */
  const remove = validatedHandler(byId, async ({ params }, response) => {
    await service.remove(principal(response), params.notificationId);
    response.sendStatus(204);
  });
  /** Resolve đích có quyền trước khi UI điều hướng. */
  const target = validatedHandler(byId, async ({ params }, response) => {
    response.json(await service.target(principal(response), params.notificationId));
  });
  return { list, count, read, readAll, remove, target };
}
