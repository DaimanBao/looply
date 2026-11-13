import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes, randomInt } from "node:crypto";
import type { Server } from "node:http";
import { createOtpInspector } from "../../src/development/otp-inspector";
import { createAuthFixture, type AuthFixture } from "../helpers/auth-fixture";

describe("Development OTP inspector with actual Redis lifecycle", () => {
  let fixture: AuthFixture;
  let server: Server;
  let url: string;
  const key = randomBytes(48).toString("base64url");
  beforeAll(async () => {
    fixture = await createAuthFixture();
    server = createOtpInspector(
      "development",
      { enabled: true, key, port: 3101 },
      {
        store: fixture.redis,
        sms: fixture.sms,
        email: fixture.email,
        pepper: fixture.config.AUTH_OTP_PEPPER,
        namespace: fixture.prefix,
      },
    );
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Missing inspector address");
    url = `http://127.0.0.1:${address.port}/inspect`;
  });
  afterAll(async () => {
    if (server?.listening) {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    await fixture?.dispose();
  });
  it("cannot inspect consumed/expired challenges and does not reset OTP cooldown", async () => {
    const destination = `+849${randomInt(10000000, 100000000)}`;
    const challenge = await fixture.otp.request({
      purpose: "REGISTER_PHONE",
      destination,
    });
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    };
    const body = JSON.stringify({
      challengeId: challenge.challengeId,
      destination,
    });
    const response = await fetch(url, { method: "POST", headers, body });
    expect(response.status).toBe(200);
    const code = fixture.sms.lastCode(destination);
    expect(!!code).toBe(true);
    const payload: unknown = await response.json();
    expect(JSON.stringify(payload) === JSON.stringify({ code })).toBe(true);
    await expect(
      fixture.otp.request({ purpose: "REGISTER_PHONE", destination }),
    ).rejects.toMatchObject({ status: 429, code: "OTP_LIMIT" });
    if (!code) throw new Error("Missing fake delivery");
    await fixture.ephemeral.consumeOtp(
      { purpose: "REGISTER_PHONE", destination },
      challenge.challengeId,
      code,
    );
    expect((await fetch(url, { method: "POST", headers, body })).status).toBe(
      404,
    );
    const expiredDestination = `+849${randomInt(10000000, 100000000)}`;
    const expired = await fixture.otp.request({
      purpose: "REGISTER_PHONE",
      destination: expiredDestination,
    });
    await fixture.redis.eval(
      "return redis.call('EXPIRE',KEYS[1],0)",
      [fixture.prefix + "otp:" + expired.challengeId],
      [],
    );
    expect(
      (
        await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify({
            challengeId: expired.challengeId,
            destination: expiredDestination,
          }),
        })
      ).status,
    ).toBe(404);
    await fixture.redis.close();
    expect((await fetch(url, { method: "POST", headers, body })).status).toBe(
      503,
    );
  });
});
