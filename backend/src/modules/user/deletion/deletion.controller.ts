import type { RequestHandler } from "express";
import { z } from "zod";
import type { DeletionService } from "./deletion.service";
import { principal } from "../../auth";
import { validatedHandler } from "../../../shared/middleware/validate-request";
import { reauthProofSchema } from "../../auth";
import { clearRefresh } from "../../auth";

/** Cung cấp thao tác xóa/hủy tường minh mà không nhúng logic vòng đời trong HTTP handler. */
export function createDeletionController(deletion: DeletionService, secure: boolean) {
  /** Lập lịch xóa và gỡ refresh cookie trình duyệt. */
  const request = validatedHandler(
    z.object({ body: reauthProofSchema }),
    async ({ body }, response) => {
      await deletion.request(principal(response), body.reauthProof);
      clearRefresh(response, secure);
      response.status(202).end();
    },
  );
  /** Chỉ hủy xóa qua yêu cầu tường minh đã xác thực. */
  const cancel: RequestHandler = async (_request, response) => {
    await deletion.cancel(principal(response));
    response.sendStatus(204);
  };
  return { request, cancel };
}
