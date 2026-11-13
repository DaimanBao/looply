import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createAuthFixture, type AuthFixture } from "../helpers/auth-fixture";
import { otpBinding } from "../../src/modules/auth/otp/otp.service";
import { digest, otpDigest } from "../../src/modules/auth/security/random";

let fixture: AuthFixture;
beforeEach(async () => { fixture = await createAuthFixture(); });
afterEach(async () => { if (fixture) await fixture.dispose(); });

describe("Auth API with real PostgreSQL and Redis", () => {
  it.each(["LOGIN_PHONE", "RESET_PASSWORD"] as const)("rejects a %s code issued before its contact moves to another account", async (purpose) => {
    const original = await fixture.user({ email: `${crypto.randomUUID()}@example.com`, verified: true });
    const replacement = await fixture.user();
    const destination = purpose === "LOGIN_PHONE" ? original.phone : original.email;
    if (!destination) throw new Error("Missing fixture contact");
    const challenge = await fixture.otp.request({ purpose, destination });
    const code = (purpose === "LOGIN_PHONE" ? fixture.sms : fixture.email).lastCode(destination);
    await fixture.db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: original.id }, data: purpose === "LOGIN_PHONE" ? { phone: null, phoneVerifiedAt: null } : { email: null, emailVerifiedAt: null } });
      await tx.user.update({ where: { id: replacement.id }, data: purpose === "LOGIN_PHONE" ? { phone: destination, phoneVerifiedAt: new Date() } : { email: destination, emailVerifiedAt: new Date() } });
    });
    const response = purpose === "LOGIN_PHONE"
      ? await request(fixture.app).post("/api/auth/login/phone").send({ phone: destination, challengeId: challenge.challengeId, code })
      : await request(fixture.app).post("/api/auth/password/reset").send({ destination, challengeId: challenge.challengeId, code, password: "Attacker replacement phrase 527!" });
    expect(response.status).toBe(401);
    expect((await fixture.db.user.findUniqueOrThrow({ where: { id: replacement.id } })).passwordHash === replacement.passwordHash).toBe(true);
    expect(await fixture.db.authSession.count({ where: { userId: replacement.id } })).toBe(0);
  });
  it("returns safe validation errors for malformed or wrong-channel contacts", async () => {
    for (const destination of ["invalid", "not-a-phone@example.com"]) {
      const response = await request(fixture.app).post("/api/auth/otp/request").send({ purpose: "REGISTER_PHONE", destination });
      expect(response.status).toBe(400); expect(response.body.error.code).toBe("INVALID_CONTACT");
    }
  });
  it("registers only after SMS verification and issues a private refresh cookie", async () => {
    const province = await fixture.province(); const username = `t_${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`; const phone = "+849" + String(Date.now()).slice(-8);
    fixture.usernames.add(username);
    const challenge = await fixture.otp.request({ purpose: "REGISTER_PHONE", destination: phone });
    const response = await request(fixture.app).post("/api/auth/register").send({ username, phone, password: "Fixture passphrase 928!", provinceCode: province.code, challengeId: challenge.challengeId, code: fixture.sms.lastCode(phone), email: " Unverified+tag@Example.com " });
    expect(response.status).toBe(201); expect(response.body.refreshToken).toBeUndefined();
    expect(response.headers["set-cookie"][0]).toContain("HttpOnly"); expect(response.headers["set-cookie"][0]).toContain("SameSite=Strict");
    const user = await fixture.db.user.findUniqueOrThrow({ where: { username } }); fixture.userIds.add(user.id);
    expect(user.email).toBe("unverified+tag@example.com"); expect(user.emailVerifiedAt).toBeNull(); expect(user.phoneVerifiedAt).toBeInstanceOf(Date);
    const session = await fixture.db.authSession.findFirstOrThrow({ where: { userId: user.id } });
    const refresh = decodeURIComponent(response.headers["set-cookie"][0].split(";")[0].split("=")[1]);
    expect(session.refreshTokenHash === digest(refresh)).toBe(true);
    expect(Math.abs(session.expiresAt.getTime() - session.createdAt.getTime() - 7 * 86400000)).toBeLessThan(1000);
    const me = await request(fixture.app).get("/api/users/me").auth(response.body.accessToken, { type: "bearer" }); expect(me.status).toBe(200);
    expect(JSON.stringify(me.body)).not.toContain("passwordHash");
  });
  it("allows exactly one refresh winner and immediately rejects revoked access sessions", async () => {
    const user = await fixture.user(); const login = await request(fixture.app).post("/api/auth/login/password").send({ username: user.username, password: "Fixture passphrase 928!" });
    expect(login.status).toBe(200); const cookie = login.headers["set-cookie"][0].split(";")[0];
    const refreshed = await Promise.all([1, 2].map(() => request(fixture.app).post("/api/auth/refresh").set("Origin", "http://localhost:4200").set("Cookie", cookie)));
    expect(refreshed.map((response) => response.status).sort()).toEqual([200, 401]);
    await fixture.db.authSession.updateMany({ where: { userId: user.id }, data: { revokedAt: new Date() } });
    expect((await request(fixture.app).get("/api/users/me").auth(login.body.accessToken, { type: "bearer" })).status).toBe(401);
  });
  it("rejects missing/untrusted origins for cookie authentication", async () => {
    expect((await request(fixture.app).post("/api/auth/refresh")).status).toBe(403);
    expect((await request(fixture.app).post("/api/auth/refresh").set("Origin", "https://attacker.example")).status).toBe(403);
  });
  it("does not cancel pending deletion on login and restricts ordinary interactions", async () => {
    const user = await fixture.user({ status: "PENDING_DELETION" });
    const login = await request(fixture.app).post("/api/auth/login/password").send({ username: user.username, password: "Fixture passphrase 928!" });
    expect(login.status).toBe(200); expect(login.body.status).toBe("PENDING_DELETION");
    expect((await request(fixture.app).get("/api/users/me").auth(login.body.accessToken, { type: "bearer" })).status).toBe(200);
    expect((await request(fixture.app).patch("/api/users/me").auth(login.body.accessToken, { type: "bearer" }).send({ displayName: "Changed" })).status).toBe(403);
    expect((await fixture.db.user.findUniqueOrThrow({ where: { id: user.id } })).status).toBe("PENDING_DELETION");
  });
});

describe("OTP and one-use proof security in real Redis", () => {
  it("expires hashed challenges after five minutes and caps sends across purposes", async () => {
    const binding = otpBinding("REGISTER_PHONE", "+849" + String(Date.now()).slice(-8));
    const challenge = await fixture.ephemeral.requestOtp(binding);
    const key = fixture.prefix + "otp:" + challenge.challengeId;
    const ttl = await fixture.redis.eval("return redis.call('TTL',KEYS[1])", [key], []);
    expect(ttl).toBeLessThanOrEqual(300); expect(ttl).toBeGreaterThanOrEqual(299);
    const raw = await fixture.redis.eval("return redis.call('GET',KEYS[1])", [key], []);
    if (typeof raw !== "string") throw new Error("Missing Redis challenge");
    const stored = z.object({ hash: z.string(), code: z.never().optional() }).parse(JSON.parse(raw));
    expect(stored.hash === otpDigest(fixture.config.AUTH_OTP_PEPPER, JSON.stringify(binding) + challenge.challengeId, challenge.code)).toBe(true);
    await fixture.redis.eval("return redis.call('PEXPIRE',KEYS[1],1)", [key], []);
    await new Promise((resolve) => setTimeout(resolve, 10));
    await expect(fixture.ephemeral.consumeOtp(binding, challenge.challengeId, challenge.code)).rejects.toMatchObject({ status: 401 });
    const identity = fixture.prefix + "otp-identity:" + digest(binding.destination);
    for (let index = 1; index < 5; index++) {
      await fixture.redis.eval("return redis.call('DEL',KEYS[1])", [identity + ":cooldown"], []);
      await fixture.ephemeral.requestOtp({ ...binding, purpose: "LOGIN_PHONE" });
    }
    await fixture.redis.eval("return redis.call('DEL',KEYS[1])", [identity + ":cooldown"], []);
    await expect(fixture.ephemeral.requestOtp(binding)).rejects.toMatchObject({ status: 429 });
    expect(await fixture.redis.eval("return redis.call('TTL',KEYS[1])", [identity + ":lock"], [])).toBeGreaterThanOrEqual(899);
  });
  it("enforces a shared limiter atomically across concurrent attempts", async () => {
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => fixture.ephemeral.limit("same-login", 3, 60)));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(3);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(5);
  });
  it("consumes an OTP exactly once across concurrent requests and rejects purpose reuse", async () => {
    const binding = otpBinding("REGISTER_PHONE", "+849" + String(Date.now()).slice(-8));
    const challenge = await fixture.ephemeral.requestOtp(binding);
    await expect(fixture.ephemeral.consumeOtp({ ...binding, purpose: "LOGIN_PHONE" }, challenge.challengeId, challenge.code)).rejects.toMatchObject({ status: 401 });
    const results = await Promise.allSettled([1, 2].map(() => fixture.ephemeral.consumeOtp(binding, challenge.challengeId, challenge.code)));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  });
  it("preserves failed-attempt counts across resend and locks after five attempts", async () => {
    const binding = otpBinding("REGISTER_PHONE", "+849" + String(Date.now()).slice(-8));
    const first = await fixture.ephemeral.requestOtp(binding); const wrong = first.code === "000000" ? "000001" : "000000";
    for (let index = 0; index < 3; index++) await expect(fixture.ephemeral.consumeOtp(binding, first.challengeId, wrong)).rejects.toMatchObject({ status: 401 });
    await expect(fixture.ephemeral.requestOtp(binding)).rejects.toMatchObject({ status: 429 });
    const identity = fixture.prefix + "otp-identity:" + digest(binding.destination);
    await fixture.redis.eval("redis.call('DEL',KEYS[1]); return 1", [identity + ":cooldown"], []);
    const second = await fixture.ephemeral.requestOtp(binding);
    const secondWrong = second.code === "000000" ? "000001" : "000000";
    for (let index = 0; index < 2; index++) await expect(fixture.ephemeral.consumeOtp(binding, second.challengeId, secondWrong)).rejects.toMatchObject({ status: 401 });
    await expect(fixture.ephemeral.consumeOtp(binding, second.challengeId, second.code)).rejects.toMatchObject({ status: 401 });
    await expect(fixture.ephemeral.requestOtp(binding)).rejects.toMatchObject({ status: 429 });
    const attemptsTtl = await fixture.redis.eval("return redis.call('TTL',KEYS[1])", [identity + ":tries"], []);
    expect(attemptsTtl).toBeLessThanOrEqual(900); expect(attemptsTtl).toBeGreaterThanOrEqual(899);
    await fixture.redis.eval("redis.call('DEL',KEYS[1],KEYS[2],KEYS[3]); return 1", [identity + ":lock", identity + ":tries", identity + ":cooldown"], []);
    const afterLock = await fixture.ephemeral.requestOtp(binding);
    await expect(fixture.ephemeral.consumeOtp(binding, afterLock.challengeId, afterLock.code)).resolves.toBeUndefined();
  });
  it("binds proof to action/session and rejects reuse, expiry and unavailable Redis", async () => {
    const proof = await fixture.ephemeral.issueProof("session:CHANGE_PASSWORD");
    await expect(fixture.ephemeral.consumeProof(proof, "other:CHANGE_PHONE")).rejects.toMatchObject({ status: 401 });
    const other = await fixture.ephemeral.issueProof("session:CHANGE_PASSWORD");
    await fixture.ephemeral.consumeProof(other, "session:CHANGE_PASSWORD");
    await expect(fixture.ephemeral.consumeProof(other, "session:CHANGE_PASSWORD")).rejects.toMatchObject({ status: 401 });
    const expired = await fixture.ephemeral.issueProof("expired");
    await fixture.redis.eval("redis.call('DEL',KEYS[1]); return 1", [fixture.prefix + "proof:" + digest(expired)], []);
    await expect(fixture.ephemeral.consumeProof(expired, "expired")).rejects.toMatchObject({ status: 401 });
    await fixture.redis.close(); await expect(fixture.ephemeral.issueProof("offline")).rejects.toMatchObject({ status: 503 });
  });
});
