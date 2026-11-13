import type { Server } from "node:http";
import type { Logger } from "pino";
import type { AppConfig } from "../config/environment";
import type { DatabaseLifecycle } from "../shared/database/prisma";

export type ServerRuntime = { start(): Promise<void>; stop(): Promise<void> };
type RuntimeDependencies = {
  server: Server;
  database: DatabaseLifecycle;
  logger: Logger;
  config: Pick<AppConfig, "host" | "port" | "shutdownTimeoutMs">;
  services?: { start(): Promise<void>; stop(): Promise<void> };
};

/** Chờ bind HTTP và gỡ error handler tạm sau thành công hoặc thất bại. */
function listen(server: Server, config: RuntimeDependencies["config"]): Promise<void> {
  return new Promise((resolve, reject) => {
    /** Ngăn lỗi socket khởi động để sót callback lắng nghe đã đăng ký. */
    function onError(error: Error): void {
      server.off("listening", onListening);
      reject(error);
    }
    /** Đánh dấu bind hoàn tất và giao shutdown tiếp theo cho runtime. */
    function onListening(): void {
      server.off("error", onError);
      resolve();
    }
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(config.port, config.host);
  });
}

/** Chờ yêu cầu HTTP đang chạy và đóng socket keep-alive rảnh trước khi ngắt database. */
function closeHttp(server: Server): Promise<void> {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeIdleConnections();
  });
}

/** Quản lý vòng đời HTTP/database với cleanup idempotent và một deadline shutdown tổng. */
export function createServerRuntime({
  server,
  database,
  logger,
  config,
  services,
}: RuntimeDependencies): ServerRuntime {
  let startup: Promise<void> | undefined;
  let shutdown: Promise<void> | undefined;
  let disconnect: Promise<void> | undefined;
  let stopping = false;

  /** Bảo đảm lỗi khởi động và tín hiệu shutdown không ngắt pool hai lần. */
  function disconnectOnce(): Promise<void> {
    disconnect ??= (async () => {
      try {
        await services?.stop();
      } finally {
        await database.$disconnect();
      }
    })();
    return disconnect;
  }

  /** Kết nối database trước khi nhận HTTP và cleanup khi khởi động lỗi. */
  async function startResources(): Promise<void> {
    try {
      await database.$connect();
      await services?.start();
      if (stopping) return;
      await listen(server, config);
      logger.info({ port: config.port }, "Backend started");
    } catch (error: unknown) {
      try {
        await disconnectOnce();
      } catch {
        logger.error({ code: "DATABASE_DISCONNECT_FAILED" }, "Startup cleanup failed");
      }
      throw error;
    }
  }

  /** Giữ yêu cầu đang chạy; cleanup vẫn chạy khi startup hoặc close lỗi. */
  async function closeResources(): Promise<void> {
    try {
      await startup;
      await closeHttp(server);
    } finally {
      await disconnectOnce();
    }
  }

  /** Giới hạn cả chờ HTTP và ngắt database; entrypoint xử lý thoát tiến trình cưỡng chế. */
  async function stopWithinDeadline(): Promise<void> {
    let timer: NodeJS.Timeout | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        server.closeAllConnections();
        logger.error({ code: "SHUTDOWN_TIMEOUT" }, "Shutdown exceeded its deadline");
        reject(new Error("Shutdown timed out"));
      }, config.shutdownTimeoutMs);
    });
    try {
      await Promise.race([closeResources(), deadline]);
      logger.info("Backend stopped");
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    /** Dùng chung một lần thử khởi động, ngăn khởi động lại runtime đã dừng. */
    start(): Promise<void> {
      if (stopping) return Promise.reject(new Error("Backend is stopping"));
      startup ??= startResources();
      return startup;
    },
    /** Dùng chung thao tác shutdown cho tín hiệu lặp hoặc đồng thời. */
    stop(): Promise<void> {
      stopping = true;
      shutdown ??= stopWithinDeadline();
      return shutdown;
    },
  };
}
