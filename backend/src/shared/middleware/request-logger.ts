import type { Request, Response } from "express";
import type { Logger } from "pino";
import pinoHttp from "pino-http";

/** Logs only request metadata, omitting URL/query/body/headers and arbitrary error details. */
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
