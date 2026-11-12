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
};

/** Waits for HTTP binding and removes its temporary error handler after success or failure. */
function listen(server: Server, config: RuntimeDependencies["config"]): Promise<void> {
  return new Promise((resolve, reject) => {
    /** Prevents a startup socket failure from leaving a listening callback registered. */
    function onError(error: Error): void {
      server.off("listening", onListening);
      reject(error);
    }
    /** Marks binding complete and hands subsequent shutdown to the runtime. */
    function onListening(): void {
      server.off("error", onError);
      resolve();
    }
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(config.port, config.host);
  });
}

/** Drains active HTTP requests and closes idle keep-alive sockets before database disconnect. */
function closeHttp(server: Server): Promise<void> {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeIdleConnections();
  });
}

/** Owns HTTP/database lifecycle with idempotent cleanup and one total shutdown deadline. */
export function createServerRuntime({ server, database, logger, config }: RuntimeDependencies): ServerRuntime {
  let startup: Promise<void> | undefined;
  let shutdown: Promise<void> | undefined;
  let disconnect: Promise<void> | undefined;
  let stopping = false;

  /** Ensures startup failure and signal shutdown cannot disconnect the pool twice. */
  function disconnectOnce(): Promise<void> {
    disconnect ??= database.$disconnect();
    return disconnect;
  }

  /** Establishes the database before accepting HTTP traffic, cleaning up failed startups. */
  async function startResources(): Promise<void> {
    try {
      await database.$connect();
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

  /** Preserves in-flight requests; cleanup still runs when startup or close fails. */
  async function closeResources(): Promise<void> {
    try {
      await startup;
      await closeHttp(server);
    } finally {
      await disconnectOnce();
    }
  }

  /** Bounds both HTTP draining and database disconnect; entrypoint handles a forced process exit. */
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
    /** Shares one startup attempt and prevents restarting an already stopped runtime. */
    start(): Promise<void> {
      if (stopping) return Promise.reject(new Error("Backend is stopping"));
      startup ??= startResources();
      return startup;
    },
    /** Shares one shutdown operation across repeated or concurrent signals. */
    stop(): Promise<void> {
      stopping = true;
      shutdown ??= stopWithinDeadline();
      return shutdown;
    },
  };
}
