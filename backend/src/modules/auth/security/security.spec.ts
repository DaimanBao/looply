import { describe, expect, it } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { AccessTokens } from "./access-tokens";
import { hashPassword, verifyPassword, PwnedPasswordScreen } from "./password";
import { registerSchema } from "../auth.schema";
import { loadAuthConfig } from "../../../config/auth-config";

describe("Authentication security boundaries", () => {
  it("uses salted Argon2id and rejects incorrect or malformed credentials", async () => {
    const hash = await hashPassword("A fixture passphrase 927!");
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(hash, "A fixture passphrase 927!")).toBe(true);
    expect(await verifyPassword(hash, "wrong")).toBe(false);
    expect(await verifyPassword(null, "wrong")).toBe(false);
    expect(await verifyPassword("invalid", "wrong")).toBe(false);
  });
  it("signs session-bound JWTs and rejects wrong keys and issuers", async () => {
    const key = randomBytes(48).toString("base64url");
    const tokens = new AccessTokens(key, "fixture");
    const userId = randomUUID();
    const sessionId = randomUUID();
    const token = await tokens.issue(userId, sessionId);
    expect(await tokens.verify(token)).toEqual({ userId, sessionId });
    await expect(
      new AccessTokens(randomBytes(48).toString("base64url"), "fixture").verify(token),
    ).rejects.toMatchObject({ status: 401 });
    await expect(new AccessTokens(key, "other").verify(token)).rejects.toMatchObject({
      status: 401,
    });
    await expect(tokens.verify(token + "x")).rejects.toMatchObject({ status: 401 });
  });
  it("rejects signed JWTs with expired, future, wrong-audience or wrong-algorithm claims", async () => {
    const { SignJWT } = await import("jose");
    const key = randomBytes(48);
    const tokens = new AccessTokens(key.toString("base64url"), "fixture");
    const encoded = new TextEncoder().encode(key.toString("base64url"));
    const now = Math.floor(Date.now() / 1000);
    for (const invalid of [
      { exp: now - 1 },
      { nbf: now + 300 },
      { aud: "other" },
      { alg: "HS384" },
    ]) {
      const token = await new SignJWT({
        sid: randomUUID(),
        ...(invalid.nbf ? { nbf: invalid.nbf } : {}),
      })
        .setProtectedHeader({ alg: invalid.alg ?? "HS256", typ: "JWT" })
        .setSubject(randomUUID())
        .setIssuer("fixture")
        .setAudience(invalid.aud ?? "looply-api")
        .setIssuedAt(now)
        .setExpirationTime(invalid.exp ?? now + 900)
        .sign(encoded);
      await expect(tokens.verify(token)).rejects.toMatchObject({ status: 401 });
    }
  });
  it("screens breached passwords via a padded prefix request and fails closed on outages", async () => {
    const screen = new PwnedPasswordScreen(async (input, options) => {
      expect(String(input)).toBe("https://api.pwnedpasswords.com/range/5BAA6");
      expect(options?.headers).toMatchObject({ "Add-Padding": "true" });
      return new Response("1E4C9B93F3F0682250B6CF8331B7EE68FD8:100\r\n");
    });
    await expect(screen.check("password")).rejects.toMatchObject({ code: "UNSAFE_PASSWORD" });
    await expect(
      new PwnedPasswordScreen(async () => new Response(null, { status: 503 })).check("anything"),
    ).rejects.toMatchObject({ status: 503 });
  });
  it("normalizes contacts without Gmail-specific rewriting", () => {
    const parsed = registerSchema.parse({
      username: "TEST___",
      password: "Long passphrase 199!",
      phone: "+84912345678",
      provinceCode: "01",
      email: " A.B+suffix@EXAMPLE.COM ",
      challengeId: randomUUID(),
      code: "123456",
    });
    expect(parsed.username).toBe("test___");
    expect(parsed.email).toBe("a.b+suffix@example.com");
  });
  it("rejects fake providers and non-isolated Redis in production/test configuration", () => {
    const input = {
      AUTH_JWT_SECRET: "a".repeat(48),
      AUTH_OTP_PEPPER: "b".repeat(48),
      GOOGLE_CLIENT_ID: "fixture",
      AUTH_ALLOWED_ORIGINS: "https://example.com",
      REDIS_URL: "redis://localhost:6380/0",
    };
    expect(() => loadAuthConfig(input, "production")).toThrow("Production requires real");
    expect(() => loadAuthConfig(input, "test")).toThrow("dedicated nonzero Redis");
    expect(() =>
      loadAuthConfig({ ...input, AUTH_OTP_PEPPER: input.AUTH_JWT_SECRET }, "development"),
    ).toThrow("independent");
    expect(() =>
      loadAuthConfig({ ...input, AUTH_ALLOWED_ORIGINS: "invalid-private-value" }, "development"),
    ).toThrow(/^Invalid Auth configuration: AUTH_ALLOWED_ORIGINS$/);
    expect(() =>
      loadAuthConfig({ ...input, REDIS_URL: "invalid-private-value" }, "development"),
    ).toThrow(/^Invalid Auth configuration: REDIS_URL$/);
  });
});
