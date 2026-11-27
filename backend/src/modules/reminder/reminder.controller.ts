import type { RequestHandler } from "express";
import { z } from "zod";
import { principal } from "../auth";
import { validatedHandler } from "../../shared/middleware/validate-request";
import type { ReminderService } from "./reminder.service";

/** Ánh xạ danh tính đã xác thực sang service, không nhận định danh do client chọn. */
export function createReminderController(service: ReminderService) {
  /** Đọc các mục còn thiếu mà không cấp lượt hiển thị. */
  const evaluate: RequestHandler = async (_request, response) => {
    response.json(await service.evaluate(principal(response)));
  };
  /** Cấp lượt nguyên tử cho phiên Auth của request hiện tại. */
  const present = validatedHandler(
    z.object({ body: z.strictObject({}) }),
    async (_input, response) => {
      response.json(await service.present(principal(response)));
    },
  );
  return { evaluate, present };
}
