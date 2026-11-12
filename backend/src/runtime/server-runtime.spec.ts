import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createLogger } from "../shared/logger/logger";
import { createServerRuntime } from "./server-runtime";

const servers: Server[] = [];

/** Builds a runtime with a fake database and real local HTTP sockets on an ephemeral port. */
function runtimeFixture(options: { server?: Server; port?: number; shutdownTimeoutMs?: number } = {}) {
  const server = options.server ?? createServer();
  servers.push(server);
  const database = {
    $connect: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    $disconnect: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  };
  const runtime = createServerRuntime({
    server, database, logger: createLogger("silent"),
    config: { host: "127.0.0.1", port: options.port ?? 0, shutdownTimeoutMs: options.shutdownTimeoutMs ?? 1000 },
  });
  return { server, database, runtime };
}

/** Closes only sockets allocated by these tests, including deliberate startup-failure fixtures. */
afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    if (server.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

describe("Server/database lifecycle", () => {
  // HTTP must remain closed until database initialization resolves.
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

  // A failed connection must not open the HTTP port or leave database cleanup to process exit.
  it("cleans up a failed database startup", async () => {
    const { server, database, runtime } = runtimeFixture();
    database.$connect.mockRejectedValue(new Error("fixture-connect-failed"));
    await expect(runtime.start()).rejects.toThrow("fixture-connect-failed");
    expect(server.listening).toBe(false);
    expect(database.$disconnect).toHaveBeenCalledTimes(1);
  });

  // A real EADDRINUSE socket failure occurs after connection and must still disconnect the pool.
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

  // SIGTERM during connect must not accept traffic after the shutdown request.
  it("supports shutdown while a connection attempt is pending", async () => {
    const { server, database, runtime } = runtimeFixture();
    let finishConnect: () => void = () => { throw new Error("Connection resolver missing"); };
    database.$connect.mockImplementation(() => new Promise<void>((resolve) => { finishConnect = resolve; }));
    const starting = runtime.start();
    const stopping = runtime.stop();
    finishConnect();
    await starting;
    await stopping;
    expect(server.listening).toBe(false);
    expect(database.$disconnect).toHaveBeenCalledTimes(1);
  });

  // The deadline bounds database cleanup too, not just HTTP keep-alive sockets.
  it("rejects a hung disconnect within the configured shutdown deadline", async () => {
    const { server, database, runtime } = runtimeFixture({ shutdownTimeoutMs: 10 });
    const forceClose = vi.spyOn(server, "closeAllConnections");
    database.$disconnect.mockImplementation(() => new Promise<void>(() => {}));
    await expect(runtime.stop()).rejects.toThrow("Shutdown timed out");
    expect(forceClose).toHaveBeenCalledTimes(1);
    expect(database.$disconnect).toHaveBeenCalledTimes(1);
  });

  // In-flight HTTP work is drained before the database becomes unavailable.
  it("finishes active requests before disconnecting", async () => {
    let requestStarted: () => void = () => { throw new Error("Request resolver missing"); };
    const started = new Promise<void>((resolve) => { requestStarted = resolve; });
    let finishResponse: () => void = () => { throw new Error("Response missing"); };
    const server = createServer((_request, response) => {
      finishResponse = () => { response.end("complete"); };
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
