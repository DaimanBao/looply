import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createLogger } from "../shared/logger/logger";
import { createServerRuntime } from "./server-runtime";

const servers: Server[] = [];

/** Tạo runtime dùng database giả và HTTP socket local thật trên cổng tạm. */
function runtimeFixture(
  options: {
    server?: Server;
    port?: number;
    shutdownTimeoutMs?: number;
    services?: { start(): Promise<void>; stop(): Promise<void>; beforeStop?(): void };
  } = {},
) {
  const server = options.server ?? createServer();
  servers.push(server);
  const database = {
    $connect: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    $disconnect: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  };
  const runtime = createServerRuntime({
    server,
    database,
    logger: createLogger("silent"),
    config: {
      host: "127.0.0.1",
      port: options.port ?? 0,
      shutdownTimeoutMs: options.shutdownTimeoutMs ?? 1000,
    },
    services: options.services,
  });
  return { server, database, runtime };
}

/** Chỉ đóng socket do các test này cấp phát, kể cả fixture cố ý lỗi khởi động. */
afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    if (server.listening)
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
  }
});

describe("Server/database lifecycle", () => {
  it("releases upgraded connections before waiting for HTTP close", async () => {
    const services = {
      start: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      stop: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      beforeStop: vi.fn<() => void>(),
    };
    const { runtime, server } = runtimeFixture({ services });
    await runtime.start();
    const close = server.close.bind(server);
    vi.spyOn(server, "close").mockImplementation((callback) => {
      expect(services.beforeStop).toHaveBeenCalledOnce();
      return close(callback);
    });
    await runtime.stop();
  });
  it("connects auxiliary resources before listening and stops them before disconnecting the database", async () => {
    const services = {
      start: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      stop: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    };
    const { runtime, database } = runtimeFixture({ services });
    services.stop.mockImplementation(async () => {
      expect(database.$disconnect).not.toHaveBeenCalled();
    });
    await runtime.start();
    expect(services.start).toHaveBeenCalledOnce();
    await runtime.stop();
    expect(services.stop).toHaveBeenCalledOnce();
    expect(database.$disconnect).toHaveBeenCalledOnce();
  });
  it("refuses traffic and cleans up when an auxiliary security dependency cannot start", async () => {
    const services = {
      start: vi.fn<() => Promise<void>>().mockRejectedValue(new Error("Unavailable fixture Redis")),
      stop: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    };
    const { runtime, server, database } = runtimeFixture({ services });
    await expect(runtime.start()).rejects.toThrow("Unavailable fixture Redis");
    expect(server.listening).toBe(false);
    expect(services.stop).toHaveBeenCalledOnce();
    expect(database.$disconnect).toHaveBeenCalledOnce();
  });
  // HTTP phải đóng đến khi khởi tạo database hoàn tất.
  it("connects before listening and disconnects once after stopping", async () => {
    const { server, database, runtime } = runtimeFixture();
    expect(server.listening).toBe(false);
    const first = runtime.start();
    expect(runtime.start()).toBe(first);
    await first;
    expect(server.listening).toBe(true);
    expect(database.$connect).toHaveBeenCalledTimes(1);
    const stopping = runtime.stop();
    expect(runtime.stop()).toBe(stopping);
    await stopping;
    expect(server.listening).toBe(false);
    expect(database.$disconnect).toHaveBeenCalledTimes(1);
    await expect(runtime.start()).rejects.toThrow("stopping");
  });

  // Kết nối lỗi không được mở cổng HTTP hoặc để cleanup database chờ tiến trình thoát.
  it("cleans up a failed database startup", async () => {
    const { server, database, runtime } = runtimeFixture();
    database.$connect.mockRejectedValue(new Error("fixture-connect-failed"));
    await expect(runtime.start()).rejects.toThrow("fixture-connect-failed");
    expect(server.listening).toBe(false);
    expect(database.$disconnect).toHaveBeenCalledTimes(1);
  });

  // Lỗi socket EADDRINUSE thực xảy ra sau kết nối vẫn phải ngắt pool.
  it("cleans up when the HTTP port is unavailable", async () => {
    const occupied = createServer();
    servers.push(occupied);
    await new Promise<void>((resolve) => occupied.listen(0, "127.0.0.1", resolve));
    const address = occupied.address();
    if (!address || typeof address === "string") throw new Error("Missing port");
    const { database, runtime } = runtimeFixture({ port: address.port });
    await expect(runtime.start()).rejects.toMatchObject({ code: "EADDRINUSE" });
    expect(database.$disconnect).toHaveBeenCalledTimes(1);
  });

  // SIGTERM trong lúc kết nối không được nhận lưu lượng sau yêu cầu shutdown.
  it("supports shutdown while a connection attempt is pending", async () => {
    const { server, database, runtime } = runtimeFixture();
    let finishConnect: () => void = () => {
      throw new Error("Connection resolver missing");
    };
    database.$connect.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishConnect = resolve;
        }),
    );
    const starting = runtime.start();
    const stopping = runtime.stop();
    finishConnect();
    await starting;
    await stopping;
    expect(server.listening).toBe(false);
    expect(database.$disconnect).toHaveBeenCalledTimes(1);
  });

  // Deadline giới hạn cả cleanup database, không chỉ socket HTTP keep-alive.
  it("rejects a hung disconnect within the configured shutdown deadline", async () => {
    const { server, database, runtime } = runtimeFixture({ shutdownTimeoutMs: 10 });
    const forceClose = vi.spyOn(server, "closeAllConnections");
    database.$disconnect.mockImplementation(() => new Promise<void>(() => {}));
    await expect(runtime.stop()).rejects.toThrow("Shutdown timed out");
    expect(forceClose).toHaveBeenCalledTimes(1);
    expect(database.$disconnect).toHaveBeenCalledTimes(1);
  });

  // Chờ công việc HTTP đang chạy hoàn tất trước khi database ngừng sẵn sàng.
  it("finishes active requests before disconnecting", async () => {
    let requestStarted: () => void = () => {
      throw new Error("Request resolver missing");
    };
    const started = new Promise<void>((resolve) => {
      requestStarted = resolve;
    });
    let finishResponse: () => void = () => {
      throw new Error("Response missing");
    };
    const server = createServer((_request, response) => {
      finishResponse = () => {
        response.end("complete");
      };
      requestStarted();
    });
    const { database, runtime } = runtimeFixture({ server });
    await runtime.start();
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing port");
    const response = fetch(`http://127.0.0.1:${address.port}`);
    await started;
    const stopping = runtime.stop();
    expect(database.$disconnect).not.toHaveBeenCalled();
    finishResponse();
    expect(await (await response).text()).toBe("complete");
    await stopping;
    expect(database.$disconnect).toHaveBeenCalledTimes(1);
  });
});
