import { createClient } from "redis";
import { unavailable } from "../auth.errors";

export interface ScriptStore { eval(script: string, keys: string[], arguments_: string[]): Promise<unknown>; }
export class RedisStore implements ScriptStore {
  private readonly client;
  private readonly database: number;
  /** Keeps credentials and reconnect diagnostics out of the public error and log paths. */
  constructor(url: string) {
    this.database = Number(new URL(url).pathname.slice(1) || "0");
    this.client = createClient({ url, disableOfflineQueue: true, socket: { connectTimeout: 5000, reconnectStrategy: false } });
    this.client.on("error", () => { /* Operations fail closed below; never log connection credentials. */ });
  }
  /** Connects explicitly during startup, never as a module-import side effect. */
  async connect(): Promise<void> {
    try {
      await this.client.connect();
      const info = await this.client.sendCommand(["CLIENT", "INFO"]);
      if (typeof info !== "string" || !new RegExp(`(?:^| )db=${this.database}(?: |$)`).test(info)) { this.client.destroy(); throw unavailable(); }
    } catch { throw unavailable(); }
  }
  /** Atomically executes application-owned Lua against keys; an outage always rejects authentication work. */
  async eval(script: string, keys: string[], arguments_: string[]): Promise<unknown> {
    if (!this.client.isReady) throw unavailable();
    try { return await this.client.eval(script, { keys, arguments: arguments_ }); } catch { throw unavailable(); }
  }
  /** Closes the client once; disconnected Redis must not delay shutdown. */
  async close(): Promise<void> { if (this.client.isOpen) this.client.destroy(); }
}
