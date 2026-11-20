import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAuthFixture, type AuthFixture } from "../helpers/auth-fixture";
import { AppError } from "../../src/shared/errors/app-error";
import { createReminderModule } from "../../src/modules/reminder";

let fixture: AuthFixture;
let token: string;
let userId: string;

beforeEach(async () => {
  fixture = await createAuthFixture();
  const user = await fixture.user();
  userId = user.id;
  token = (await fixture.db.$transaction((tx) => fixture.sessions.create(user, tx))).accessToken;
}, 15000);

afterEach(async () => {
  vi.restoreAllMocks();
  if (fixture) await fixture.dispose();
}, 15000);

/** Gửi qua middleware xác thực, validation và controller thật. */
function present(accessToken = token, input: object = {}) {
  return request(fixture.app)
    .post("/api/reminders/presentation")
    .auth(accessToken, { type: "bearer" })
    .send(input);
}

describe("Reminder PostgreSQL/Redis/HTTP integration", () => {
  it("evaluates current fields without consuming a presentation or leaking private values", async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await request(fixture.app)
        .get("/api/reminders")
        .auth(token, { type: "bearer" })
        .expect(200);
      expect(result.headers["cache-control"]).toContain("no-store");
      expect(result.body).toEqual({ items: ["EMAIL", "PROVINCE"] });
    }
    expect((await present()).body).toEqual({ items: ["EMAIL", "PROVINCE"] });
    expect((await present()).body).toEqual({ items: [] });
    expect(await fixture.db.notification.count({ where: { recipientId: userId } })).toBe(0);
    expect(await fixture.db.outboxEvent.count({ where: { aggregateId: userId } })).toBe(0);
  });

  it("reserves once across concurrent requests and module reconstruction", async () => {
    const results = await Promise.all(Array.from({ length: 12 }, () => present()));
    expect(results.every((result) => result.status === 200)).toBe(true);
    expect(results.filter((result) => result.body.items.length > 0)).toHaveLength(1);
    const reconstructed = createReminderModule(
      fixture.users,
      fixture.sessions,
      fixture.redis,
      fixture.prefix,
    );
    const principal = await fixture.sessions.authenticate(token);
    expect(await reconstructed.service.present(principal)).toEqual({ items: [] });
  });

  it("isolates accounts and rejects guests, revoked sessions, pending accounts and client-selected identity", async () => {
    await request(fixture.app).get("/api/reminders").expect(401);
    await request(fixture.app).post("/api/reminders/presentation").send({}).expect(401);
    await present(token, { userId }).expect(400);
    expect((await present()).body.items.length).toBeGreaterThan(0);
    const other = await fixture.user();
    const otherSession = await fixture.db.$transaction((tx) => fixture.sessions.create(other, tx));
    expect((await present(otherSession.accessToken)).body.items.length).toBeGreaterThan(0);
    const pending = await fixture.user({ status: "PENDING_DELETION" });
    const pendingSession = await fixture.db.$transaction((tx) =>
      fixture.sessions.create(pending, tx),
    );
    await present(pendingSession.accessToken).expect(403);
    const principal = await fixture.sessions.authenticate(token);
    await fixture.sessions.revoke(principal, principal.sessionId);
    await present().expect(401);
  });

  it("keeps the same presentation across password login, cookie refresh and logout; new login gets a new turn", async () => {
    const user = await fixture.db.user.findUniqueOrThrow({ where: { id: userId } });
    const agent = request.agent(fixture.app);
    const first = await agent
      .post("/api/auth/login/password")
      .send({ username: user.username, password: "Fixture passphrase 928!" })
      .expect(200);
    expect((await present(first.body.accessToken)).body.items.length).toBeGreaterThan(0);
    const refreshed = await agent
      .post("/api/auth/refresh")
      .set("Origin", "http://localhost:4200")
      .send({})
      .expect(200);
    const originalPrincipal = await fixture.sessions.authenticate(first.body.accessToken);
    expect((await fixture.sessions.authenticate(refreshed.body.accessToken)).sessionId).toBe(
      originalPrincipal.sessionId,
    );
    expect((await present(refreshed.body.accessToken)).body).toEqual({ items: [] });
    await agent
      .post("/api/auth/logout")
      .set("Origin", "http://localhost:4200")
      .send({})
      .expect(204);
    await present(refreshed.body.accessToken).expect(401);
    const second = await agent
      .post("/api/auth/login/password")
      .send({ username: user.username, password: "Fixture passphrase 928!" })
      .expect(200);
    expect((await present(second.body.accessToken)).body.items.length).toBeGreaterThan(0);
  });

  it("recalculates from User after real profile update, never reminds avatar and removes verified contacts", async () => {
    await present();
    const province = await fixture.province();
    await request(fixture.app)
      .patch("/api/users/me")
      .auth(token, { type: "bearer" })
      .send({ displayName: "Hồ sơ đầy đủ", bio: "", provinceCode: province.code })
      .expect(200);
    const result = await request(fixture.app)
      .get("/api/reminders")
      .auth(token, { type: "bearer" })
      .expect(200);
    expect(result.body).toEqual({ items: ["EMAIL"] });
    const destination = `${userId}@example.test`;
    const principal = await fixture.sessions.authenticate(token);
    const challenge = await fixture.otp.request(
      { purpose: "VERIFY_EMAIL", destination },
      principal,
    );
    const code = fixture.email.lastCode(destination);
    if (!code) throw new Error("Missing fixture delivery");
    const reauth = await fixture.credentials.reauthenticate(principal, {
      operation: "CHANGE_EMAIL",
      password: "Fixture passphrase 928!",
    });
    await request(fixture.app)
      .patch("/api/users/me/email")
      .auth(token, { type: "bearer" })
      .send({
        destination,
        challengeId: challenge.challengeId,
        code,
        reauthProof: reauth.reauthProof,
      })
      .expect(204);
    expect(
      (await request(fixture.app).get("/api/reminders").auth(token, { type: "bearer" })).body,
    ).toEqual({ items: [] });
    const user = await fixture.db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.avatarMediaId).toBeNull();
    const next = await fixture.db.$transaction((tx) => fixture.sessions.create(user, tx));
    expect((await present(next.accessToken)).body).toEqual({ items: [] });
  });

  it("returns a recoverable service error when Redis is unavailable without changing User or Auth", async () => {
    const unavailable = vi
      .spyOn(fixture.redis, "eval")
      .mockRejectedValueOnce(new AppError(503, "AUTH_UNAVAILABLE", "Service unavailable."));
    await present().expect(503);
    unavailable.mockRestore();
    await request(fixture.app).get("/api/users/me").auth(token, { type: "bearer" }).expect(200);
    expect((await present()).body.items.length).toBeGreaterThan(0);
  });

  it("reminds a missing phone and an unverified email while preserving database contact constraints", async () => {
    await fixture.db.user.update({
      where: { id: userId },
      data: {
        phone: null,
        phoneVerifiedAt: null,
        email: `${userId}@example.test`,
        emailVerifiedAt: null,
      },
    });
    expect((await present()).body).toEqual({ items: ["PHONE", "EMAIL", "PROVINCE"] });
  });
});
