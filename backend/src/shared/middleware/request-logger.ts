import type { Request, Response } from "express";
import type { Logger } from "pino";
import pinoHttp from "pino-http";

/** Chỉ log metadata yêu cầu, bỏ URL/query/body/header và chi tiết lỗi tùy ý. */
export function createRequestLogger(logger: Logger) {
  return pinoHttp<Request, Response>({
    logger,
    wrapSerializers: false,
    genReqId: (request) => request.requestId ?? "unassigned",
    serializers: {
      req: (request: Request) => ({ id: request.requestId, method: request.method }),
      res: (response: Response) => ({ statusCode: response.statusCode }),
      err: () => ({ code: "HTTP_REQUEST_FAILED" }),
    },
  });
}
