import { randomUUID } from "node:crypto";
import request from "supertest";
import sharp from "sharp";
import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { createAuthFixture, type AuthFixture } from "../helpers/auth-fixture";

let fixture: AuthFixture;
beforeEach(async () => {
  fixture = await createAuthFixture();
});
afterEach(async () => {
  if (fixture) await fixture.dispose();
});

describe("Account management with persistent concurrency boundaries", () => {
  it("reauthenticates by owned phone or linked Google and rejects a different Google subject", async () => {
    const user = await fixture.user();
    const issued = await fixture.identity.passwordLogin({
      username: user.username,
      password: "Fixture passphrase 928!",
    });
    const actor = await fixture.sessions.authenticate(issued.accessToken);
    if (!user.phone) throw new Error("Missing fixture phone");
    const phone = await fixture.otp.request(
      { purpose: "REAUTH_PHONE", destination: user.phone },
      actor,
    );
    const phoneProof = await request(fixture.app)
      .post("/api/auth/reauthenticate")
      .auth(issued.accessToken, { type: "bearer" })
      .send({
        operation: "CHANGE_PHONE",
        challengeId: phone.challengeId,
        code: fixture.sms.lastCode(user.phone),
      });
    expect(phoneProof.status).toBe(200);
    expect(phoneProof.body.expiresIn).toBe(300);
    const credential = randomUUID();
    const subject = randomUUID();
    fixture.googleCredentials.set(credential, { subject, verified: false });
    await fixture.db.googleAccount.create({ data: { userId: user.id, googleSubject: subject } });
    let challenge = await fixture.identity.challenge(actor);
    const googleProof = await request(fixture.app)
      .post("/api/auth/reauthenticate")
      .auth(issued.accessToken, { type: "bearer" })
      .send({ operation: "CHANGE_EMAIL", challengeId: challenge.challengeId, credential });
    expect(googleProof.status).toBe(200);
    expect(googleProof.body.expiresIn).toBe(300);
    fixture.googleCredentials.set(credential, { subject: randomUUID(), verified: false });
    challenge = await fixture.identity.challenge(actor);
    expect(
      (
        await request(fixture.app)
          .post("/api/auth/reauthenticate")
          .auth(issued.accessToken, { type: "bearer" })
          .send({ operation: "CHANGE_EMAIL", challengeId: challenge.challengeId, credential })
      ).status,
    ).toBe(401);
  });
  it("paginates safe relationship lists and prevents revoking another account's session", async () => {
    const owner = await fixture.user();
    const peers = await Promise.all([fixture.user(), fixture.user()]);
    const issued = await fixture.identity.passwordLogin({
      username: owner.username,
      password: "Fixture passphrase 928!",
    });
    const actor = await fixture.sessions.authenticate(issued.accessToken);
    for (const peer of peers) await fixture.users.relationship(actor, peer.id, "follow");
    const first = await request(fixture.app).get(`/api/users/${owner.id}/following?limit=1`);
    expect(first.status).toBe(200);
    expect(first.body.data).toHaveLength(1);
    const second = await request(fixture.app).get(
      `/api/users/${owner.id}/following?limit=1&after=${first.body.pagination.nextCursor}`,
    );
    expect(second.status).toBe(200);
    expect(second.body.data).toHaveLength(1);
    expect(second.body.data[0].id).not.toBe(first.body.data[0].id);
    expect(second.body.pagination.nextCursor).toBeNull();
    const followers = await request(fixture.app).get(`/api/users/${peers[0]!.id}/followers`);
    expect(followers.status).toBe(200);
    expect(followers.body.data.map((user: { id: string }) => user.id)).toEqual([owner.id]);
    const other = await fixture.identity.passwordLogin({
      username: peers[0]!.username,
      password: "Fixture passphrase 928!",
    });
    const otherActor = await fixture.sessions.authenticate(other.accessToken);
    expect(
      (
        await request(fixture.app)
          .delete(`/api/auth/sessions/${otherActor.sessionId}`)
          .auth(issued.accessToken, { type: "bearer" })
      ).status,
    ).toBe(204);
    await expect(fixture.sessions.authenticate(other.accessToken)).resolves.toMatchObject({
      userId: peers[0]!.id,
    });
    await fixture.users.relationship(actor, peers[0]!.id, "block");
    const blocked = await request(fixture.app)
      .get("/api/users/me/blocked")
      .auth(issued.accessToken, { type: "bearer" });
    expect(blocked.status).toBe(200);
    expect(blocked.body.data.map((user: { id: string }) => user.id)).toEqual([peers[0]!.id]);
    expect(blocked.body.data[0].phone).toBeUndefined();
    expect((await request(fixture.app).get("/api/users/me/blocked")).status).toBe(401);
  });
  it("serializes crossed email claims without deadlocking or losing either verified owner", async () => {
    const aEmail = `${randomUUID()}@example.com`;
    const bEmail = `${randomUUID()}@example.com`;
    const a = await fixture.user({ email: aEmail });
    const b = await fixture.user({ email: bEmail });
    const actors = await Promise.all(
      [a, b].map(async (user) =>
        fixture.sessions.authenticate(
          (
            await fixture.identity.passwordLogin({
              username: user.username,
              password: "Fixture passphrase 928!",
            })
          ).accessToken,
        ),
      ),
    );
    const operations = [];
    for (const [index, actor] of actors.entries()) {
      const destination = index === 0 ? bEmail : aEmail;
      const proof = await fixture.credentials.reauthenticate(actor, {
        operation: "CHANGE_EMAIL",
        password: "Fixture passphrase 928!",
      });
      const challenge = await fixture.otp.request({ purpose: "VERIFY_EMAIL", destination }, actor);
      const code = fixture.email.lastCode(destination);
      if (!code) throw new Error("Missing fixture code");
      operations.push({
        actor,
        destination,
        challengeId: challenge.challengeId,
        code,
        reauthProof: proof.reauthProof,
      });
    }
    await Promise.all(
      operations.map(({ actor, ...input }) =>
        fixture.credentials.changeContact(actor, "email", input),
      ),
    );
    expect((await fixture.repository.contact(aEmail))?.id).toBe(b.id);
    expect((await fixture.repository.contact(bEmail))?.id).toBe(a.id);
  });
  it("creates a passwordless Google account with a unique username and allows its first rename immediately", async () => {
    const credential = randomUUID();
    fixture.googleCredentials.set(credential, { subject: randomUUID(), verified: false });
    const challenge = await fixture.identity.challenge();
    const issued = await fixture.identity.googleLogin({
      credential,
      challengeId: challenge.challengeId,
    });
    const principal = await fixture.sessions.authenticate(issued.accessToken);
    fixture.userIds.add(principal.userId);
    const user = await fixture.db.user.findUniqueOrThrow({ where: { id: principal.userId } });
    expect(user.passwordHash).toBeNull();
    expect(user.username).toMatch(/^g_[a-z0-9_]+$/);
    expect(user.usernameChangedAt).toBeNull();
    expect(
      (
        await fixture.users.username(
          principal,
          `g_${randomUUID().replaceAll("-", "").slice(0, 20)}`,
        )
      ).username,
    ).not.toBe(user.username);
  });
  it("logs in with verified phone OTP, lists owned sessions and logs out with immediate revocation", async () => {
    const user = await fixture.user();
    if (!user.phone) throw new Error("Missing fixture phone");
    const challenge = await request(fixture.app)
      .post("/api/auth/otp/request")
      .send({ purpose: "LOGIN_PHONE", destination: user.phone });
    expect(challenge.status).toBe(202);
    expect(challenge.body.code).toBeUndefined();
    const login = await request(fixture.app)
      .post("/api/auth/login/phone")
      .send({
        phone: user.phone,
        challengeId: challenge.body.challengeId,
        code: fixture.sms.lastCode(user.phone),
      });
    expect(login.status).toBe(200);
    const sessions = await request(fixture.app)
      .get("/api/auth/sessions")
      .auth(login.body.accessToken, { type: "bearer" });
    expect(sessions.status).toBe(200);
    expect(sessions.body).toHaveLength(1);
    expect(sessions.body[0].current).toBe(true);
    expect(sessions.body[0].refreshTokenHash).toBeUndefined();
    const cookie = login.headers["set-cookie"][0].split(";")[0];
    expect(
      (
        await request(fixture.app)
          .post("/api/auth/logout")
          .set("Origin", "http://localhost:4200")
          .set("Cookie", cookie)
      ).status,
    ).toBe(204);
    expect(
      (
        await request(fixture.app)
          .get("/api/users/me")
          .auth(login.body.accessToken, { type: "bearer" })
      ).status,
    ).toBe(401);
  });
  it("changes email and phone only with exact action proofs and codes bound to the current session", async () => {
    const user = await fixture.user();
    const issued = await fixture.identity.passwordLogin({
      username: user.username,
      password: "Fixture passphrase 928!",
    });
    const actor = await fixture.sessions.authenticate(issued.accessToken);
    const email = `${randomUUID()}@example.com`;
    const unverified = await fixture.user({ email });
    let proof = await fixture.credentials.reauthenticate(actor, {
      operation: "CHANGE_EMAIL",
      password: "Fixture passphrase 928!",
    });
    let challenge = await fixture.otp.request(
      { purpose: "VERIFY_EMAIL", destination: email },
      actor,
    );
    expect(
      (
        await request(fixture.app)
          .patch("/api/users/me/email")
          .auth(issued.accessToken, { type: "bearer" })
          .send({
            destination: email,
            challengeId: challenge.challengeId,
            code: fixture.email.lastCode(email),
            reauthProof: proof.reauthProof,
          })
      ).status,
    ).toBe(204);
    expect(
      (await fixture.db.user.findUniqueOrThrow({ where: { id: unverified.id } })).email,
    ).toBeNull();
    const phone = "+849" + String(Date.now()).slice(-8);
    proof = await fixture.credentials.reauthenticate(actor, {
      operation: "CHANGE_PHONE",
      password: "Fixture passphrase 928!",
    });
    challenge = await fixture.otp.request({ purpose: "CHANGE_PHONE", destination: phone }, actor);
    expect(
      (
        await request(fixture.app)
          .patch("/api/users/me/phone")
          .auth(issued.accessToken, { type: "bearer" })
          .send({
            destination: phone,
            challengeId: challenge.challengeId,
            code: fixture.sms.lastCode(phone),
            reauthProof: proof.reauthProof,
          })
      ).status,
    ).toBe(204);
    expect((await fixture.db.user.findUniqueOrThrow({ where: { id: user.id } })).phone).toBe(phone);
  });
  it("resolves historical mixed-case verified emails by the same normalization as the unique index", async () => {
    const canonical = `${randomUUID()}@example.com`;
    const user = await fixture.user({
      email: ` \t${canonical.toUpperCase()}\u00a0`,
      verified: true,
    });
    expect((await fixture.repository.contact(canonical))?.id).toBe(user.id);
  });
  it("changes a password with one-use re-authentication and revokes other devices", async () => {
    const user = await fixture.user();
    const first = await fixture.identity.passwordLogin({
      username: user.username,
      password: "Fixture passphrase 928!",
    });
    const second = await fixture.identity.passwordLogin({
      username: user.username,
      password: "Fixture passphrase 928!",
    });
    const principal = await fixture.sessions.authenticate(first.accessToken);
    const proof = await fixture.credentials.reauthenticate(principal, {
      operation: "CHANGE_PASSWORD",
      password: "Fixture passphrase 928!",
    });
    const response = await request(fixture.app)
      .patch("/api/users/me/password")
      .auth(first.accessToken, { type: "bearer" })
      .send({ reauthProof: proof.reauthProof, password: "Different fixture phrase 832!" });
    expect(response.status).toBe(204);
    await expect(fixture.sessions.authenticate(first.accessToken)).resolves.toMatchObject({
      userId: user.id,
    });
    await expect(fixture.sessions.authenticate(second.accessToken)).rejects.toMatchObject({
      status: 401,
    });
    await expect(
      fixture.credentials.changePassword(principal, {
        password: "Another fixture phrase 593!",
        reauthProof: proof.reauthProof,
      }),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      fixture.identity.passwordLogin({
        username: user.username,
        password: "Fixture passphrase 928!",
      }),
    ).rejects.toMatchObject({ status: 401 });
  });
  it("recovers only verified contacts and revokes every session", async () => {
    const email = `${randomUUID()}@example.com`;
    const user = await fixture.user({ email, verified: true });
    const issued = await fixture.identity.passwordLogin({
      username: user.username,
      password: "Fixture passphrase 928!",
    });
    const challenge = await fixture.otp.request({ purpose: "RESET_PASSWORD", destination: email });
    const code = fixture.email.lastCode(email);
    expect(code).toMatch(/^[0-9]{6}$/);
    const reset = await request(fixture.app)
      .post("/api/auth/password/reset")
      .send({
        destination: email,
        challengeId: challenge.challengeId,
        code,
        password: "A recovered fixture phrase 910!",
      });
    expect(reset.status).toBe(204);
    await expect(fixture.sessions.authenticate(issued.accessToken)).rejects.toMatchObject({
      status: 401,
    });
    const unverifiedEmail = `${randomUUID()}@example.com`;
    await fixture.user({ email: unverifiedEmail });
    expect(
      (
        await request(fixture.app)
          .post("/api/auth/otp/request")
          .send({ purpose: "RESET_PASSWORD", destination: unverifiedEmail })
      ).status,
    ).toBe(202);
    expect(fixture.email.lastCode(unverifiedEmail)).toBeUndefined();
  });
  it("atomically invalidates unverified email claims and elects only one concurrent verified owner", async () => {
    const email = `${randomUUID()}@example.com`;
    const declaration = await fixture.user({ email });
    const a = await fixture.user();
    const b = await fixture.user();
    const results = await Promise.allSettled(
      [a, b].map((user) =>
        fixture.repository.transaction(async (tx) => {
          await fixture.repository.lock(tx, user.id, [`email:${email}`]);
          await fixture.repository.verifiedContact(user.id, email, tx);
        }),
      ),
    );
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await fixture.db.user.count({ where: { email, emailVerifiedAt: { not: null } } })).toBe(
      1,
    );
    expect(
      (await fixture.db.user.findUniqueOrThrow({ where: { id: declaration.id } })).email,
    ).toBeNull();
  });
  it("enforces username cooldown under concurrent changes and keeps profile/contact projection private", async () => {
    const user = await fixture.user({ email: `${randomUUID()}@example.com`, verified: true });
    const issued = await fixture.identity.passwordLogin({
      username: user.username,
      password: "Fixture passphrase 928!",
    });
    const principal = await fixture.sessions.authenticate(issued.accessToken);
    const names = [0, 1].map(() => `u_${randomUUID().replaceAll("-", "").slice(0, 20)}`);
    const outcomes = await Promise.allSettled(
      names.map((name) => fixture.users.username(principal, name)),
    );
    expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const profile = await request(fixture.app).get(`/api/users/${user.id}`);
    expect(profile.status).toBe(200);
    expect(profile.body.email).toBeUndefined();
    expect(profile.body.phone).toBeUndefined();
    expect(profile.body.passwordHash).toBeUndefined();
    const invalid = await request(fixture.app)
      .patch("/api/users/me")
      .auth(issued.accessToken, { type: "bearer" })
      .send({ email: "bypass@example.com" });
    expect(invalid.status).toBe(400);
    expect(
      (
        await request(fixture.app)
          .patch("/api/users/me")
          .auth(issued.accessToken, { type: "bearer" })
          .send({ displayName: "Đ".repeat(60) })
      ).status,
    ).toBe(200);
  });
  it("serializes Follow versus Block, removes both directions and never restores them on Unblock", async () => {
    const a = await fixture.user();
    const b = await fixture.user();
    const first = await fixture.identity.passwordLogin({
      username: a.username,
      password: "Fixture passphrase 928!",
    });
    const second = await fixture.identity.passwordLogin({
      username: b.username,
      password: "Fixture passphrase 928!",
    });
    const ap = await fixture.sessions.authenticate(first.accessToken);
    const bp = await fixture.sessions.authenticate(second.accessToken);
    expect(
      (
        await request(fixture.app)
          .put(`/api/users/${a.id.toUpperCase()}/follow`)
          .auth(first.accessToken, { type: "bearer" })
      ).status,
    ).toBe(403);
    await fixture.users.relationship(ap, b.id, "follow");
    await fixture.users.relationship(bp, a.id, "follow");
    await Promise.allSettled([
      fixture.users.relationship(ap, b.id, "block"),
      fixture.users.relationship(bp, a.id, "follow"),
    ]);
    expect(
      await fixture.db.userFollow.count({
        where: { OR: [{ followerId: a.id }, { followerId: b.id }] },
      }),
    ).toBe(0);
    expect(
      (
        await request(fixture.app)
          .get(`/api/users/${b.id}`)
          .auth(first.accessToken, { type: "bearer" })
      ).status,
    ).toBe(404);
    await expect(fixture.users.relationship(bp, a.id, "follow")).rejects.toMatchObject({
      status: 403,
    });
    await fixture.users.relationship(ap, b.id, "unblock");
    expect(await fixture.db.userFollow.count({ where: { followerId: a.id } })).toBe(0);
    expect(
      await fixture.db.notification.count({ where: { recipientId: { in: [a.id, b.id] } } }),
    ).toBe(0);
  });
  it("never auto-links Google by email, then links only after current-session re-authentication", async () => {
    const email = `${randomUUID()}@example.com`;
    const user = await fixture.user({ email, verified: true });
    const credential = randomUUID();
    fixture.googleCredentials.set(credential, { subject: randomUUID(), email, verified: true });
    let challenge = await fixture.identity.challenge();
    await expect(
      fixture.identity.googleLogin({ credential, challengeId: challenge.challengeId }),
    ).rejects.toMatchObject({ status: 409 });
    expect(await fixture.db.googleAccount.count({ where: { userId: user.id } })).toBe(0);
    const issued = await fixture.identity.passwordLogin({
      username: user.username,
      password: "Fixture passphrase 928!",
    });
    const principal = await fixture.sessions.authenticate(issued.accessToken);
    const proof = await fixture.credentials.reauthenticate(principal, {
      operation: "LINK_GOOGLE",
      password: "Fixture passphrase 928!",
    });
    challenge = await fixture.identity.challenge(principal);
    const linked = await request(fixture.app)
      .post("/api/auth/google/link")
      .auth(issued.accessToken, { type: "bearer" })
      .send({ credential, challengeId: challenge.challengeId, reauthProof: proof.reauthProof });
    expect(linked.status).toBe(204);
    challenge = await fixture.identity.challenge();
    expect(
      (
        await fixture.sessions.authenticate(
          (await fixture.identity.googleLogin({ credential, challengeId: challenge.challengeId }))
            .accessToken,
        )
      ).userId,
    ).toBe(user.id);
  });
  it("validates image contents, replaces avatar safely and cleans only detached assets", async () => {
    const user = await fixture.user();
    const issued = await fixture.identity.passwordLogin({
      username: user.username,
      password: "Fixture passphrase 928!",
    });
    const token = issued.accessToken;
    const bytes = await sharp({ create: { width: 20, height: 20, channels: 3, background: "red" } })
      .png()
      .toBuffer();
    const upload = await request(fixture.app)
      .put("/api/users/me/avatar")
      .auth(token, { type: "bearer" })
      .set("Content-Type", "application/octet-stream")
      .send(bytes);
    expect(upload.status).toBe(200);
    expect(upload.body.avatarUrl).toBe(`/api/users/${user.id}/avatar`);
    const old = await fixture.db.user.findUniqueOrThrow({ where: { id: user.id } });
    const invalid = await request(fixture.app)
      .put("/api/users/me/avatar")
      .auth(token, { type: "bearer" })
      .set("Content-Type", "application/octet-stream")
      .send(Buffer.from("fake JPEG"));
    expect(invalid.status).toBe(400);
    expect(
      (await fixture.db.user.findUniqueOrThrow({ where: { id: user.id } })).avatarMediaId,
    ).toBe(old.avatarMediaId);
    const image = await request(fixture.app).get(`/api/users/${user.id}/avatar`);
    expect(image.status).toBe(200);
    expect(image.headers["content-type"]).toContain("image/webp");
    expect(
      (await request(fixture.app).delete("/api/users/me/avatar").auth(token, { type: "bearer" }))
        .status,
    ).toBe(204);
    await fixture.cleanup.runOnce();
    expect(fixture.deletedKeys.length).toBe(1);
    expect((await request(fixture.app).get(`/api/users/${user.id}/avatar`)).status).toBe(404);
  });
});
