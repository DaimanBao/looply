import { afterEach, describe, expect, it, vi } from "vitest";
import type { Server } from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import { createOtpInspector, inspectorConfig } from "./otp-inspector";
import { FakeMessageProvider } from "../modules/auth/providers/message-provider";
import { otpDigest } from "../modules/auth/security/random";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const key = randomBytes(48).toString("base64url");
let server: Server | undefined;
afterEach(async () => {
  vi.unstubAllEnvs();
  if (server?.listening) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server?.close(() => resolve()));
  }
});

describe("Development OTP inspector", () => {
  it("refuses the CLI in production before making a network request", () => {
    const child = spawnSync(
      process.execPath,
      [resolve(__dirname, "../../scripts/inspect-otp.cjs"), randomUUID(), "+84901234567"],
      {
        env: {
          ...process.env,
          NODE_ENV: "production",
          DEV_OTP_INSPECTOR_ENABLED: "true",
          DEV_OTP_INSPECTOR_KEY: key,
        },
        encoding: "utf8",
        windowsHide: true,
      },
    );
    expect(child.status).toBe(1);
    expect(child.stdout).toBe("");
  });
  it("is disabled by default and rejects every production enablement", () => {
    expect(inspectorConfig("production", {})).toBeUndefined();
    for (const enabled of ["true", "1", "invalid"])
      expect(() =>
        inspectorConfig("production", {
          DEV_OTP_INSPECTOR_ENABLED: enabled,
          DEV_OTP_INSPECTOR_KEY: key,
        }),
      ).toThrow();
    expect(() =>
      createOtpInspector(
        "production",
        { enabled: true, key, port: 3101 },
        {
          store: { eval: async () => null },
          sms: new FakeMessageProvider(),
          email: new FakeMessageProvider(),
          pepper: key,
        },
      ),
    ).toThrow();
  });
  it("requires a separate strong key and explicit development opt-in", () => {
    expect(inspectorConfig("development", {})).toBeUndefined();
    expect(() => inspectorConfig("development", { DEV_OTP_INSPECTOR_ENABLED: "true" })).toThrow();
    expect(() =>
      inspectorConfig("development", {
        DEV_OTP_INSPECTOR_ENABLED: "true",
        DEV_OTP_INSPECTOR_KEY: key,
        AUTH_JWT_SECRET: key,
      }),
    ).toThrow();
    expect(
      inspectorConfig("development", {
        DEV_OTP_INSPECTOR_ENABLED: "true",
        DEV_OTP_INSPECTOR_KEY: key,
      }),
    ).toMatchObject({ enabled: true, port: 3101 });
  });
  it("also rejects production process environment even if a caller passes development", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() =>
      createOtpInspector(
        "development",
        { enabled: true, key, port: 3101 },
        {
          store: { eval: async () => null },
          sms: new FakeMessageProvider(),
          email: new FakeMessageProvider(),
          pepper: key,
        },
      ),
    ).toThrow();
  });
  it("rejects browser/origin and unauthorized requests; returns only the matching live challenge", async () => {
    const sms = new FakeMessageProvider();
    const email = new FakeMessageProvider();
    const destination = "+84901234567";
    const challengeId = randomUUID();
    const code = String(Math.floor(Math.random() * 1000000)).padStart(6, "0");
    await sms.send(destination, code);
    const binding = JSON.stringify({ purpose: "REGISTER_PHONE", destination });
    let live = true;
    server = createOtpInspector(
      "development",
      { enabled: true, key, port: 3101 },
      {
        sms,
        email,
        pepper: key,
        store: {
          eval: async () =>
            live
              ? JSON.stringify({
                  binding,
                  identity: "test",
                  hash: otpDigest(key, binding + challengeId, code),
                })
              : null,
        },
      },
    );
    await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing inspector port");
    const url = `http://127.0.0.1:${address.port}/inspect`;
    const body = JSON.stringify({ challengeId, destination });
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    };
    expect(
      (
        await fetch(url, {
          method: "POST",
          body,
          headers: { "Content-Type": "application/json" },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await fetch(url, {
          method: "POST",
          body,
          headers: { ...headers, Origin: "http://localhost:4200" },
        })
      ).status,
    ).toBe(403);
    const response = await fetch(url, { method: "POST", body, headers });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const result: unknown = await response.json();
    expect(JSON.stringify(result) === JSON.stringify({ code })).toBe(true);
    expect(
      (
        await fetch(url, {
          method: "POST",
          body: JSON.stringify({ challengeId: randomUUID(), destination }),
          headers,
        })
      ).status,
    ).toBe(404);
    live = false;
    expect((await fetch(url, { method: "POST", body, headers })).status).toBe(404);
  });
});
