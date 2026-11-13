import request from "supertest";
import { randomUUID } from "node:crypto";
import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { createAuthFixture, type AuthFixture } from "../helpers/auth-fixture";
import { publicProfile } from "../../src/modules/user/user.service";
import { UserRepository } from "../../src/modules/user/user.repository";
import { CleanupRepository } from "../../src/jobs/cleanup.repository";

let fixture: AuthFixture;
beforeEach(async () => { fixture = await createAuthFixture(); });
afterEach(async () => { if (fixture) await fixture.dispose(); });

/** Creates only this fixture's history, including Chat Media that deletion must never remove. */
async function history() {
  const owner = await fixture.user({ email: `${randomUUID()}@example.com`, verified: true }); const peer = await fixture.user(); const province = await fixture.province();
  const listing = await fixture.db.listing.create({ data: { ownerId: owner.id, provinceId: province.id, title: "Fixture listing title", description: "Fixture personal description that will be removed.", searchTitle: "fixture listing title", type: "SALE", price: 123, contactPhone: owner.phone } });
  const listingMedia = await fixture.db.mediaAsset.create({ data: { uploadedById: owner.id, listingId: listing.id, purpose: "LISTING", type: "IMAGE", status: "ATTACHED", storageKey: `listing/${randomUUID()}.webp`, mimeType: "image/webp", sizeBytes: 10 } });
  const chatMedia = await fixture.db.mediaAsset.create({ data: { uploadedById: owner.id, purpose: "CHAT", type: "IMAGE", status: "ATTACHED", storageKey: `chat/${randomUUID()}.webp`, mimeType: "image/webp", sizeBytes: 10 } });
  fixture.objects.set(listingMedia.storageKey, Buffer.from("listing-image")); fixture.objects.set(chatMedia.storageKey, Buffer.from("chat-image"));
  const conversation = await fixture.db.conversation.create({ data: { type: "LISTING", listingId: listing.id, initiatorId: peer.id, contactUserId: peer.id } });
  await fixture.db.conversationParticipant.createMany({ data: [owner, peer].map((user) => ({ userId: user.id, conversationId: conversation.id })) });
  const message = await fixture.db.message.create({ data: { conversationId: conversation.id, senderId: owner.id, requestId: randomUUID(), type: "TEXT", content: "Giữ nguyên email@example.com và +84912345678 trong lịch sử.", imageMediaId: chatMedia.id, payloadHash: "fixture-chat-hash" } });
  await fixture.db.userFollow.createMany({ data: [{ followerId: owner.id, followingId: peer.id }, { followerId: peer.id, followingId: owner.id }] });
  await fixture.db.notification.create({ data: { recipientId: owner.id, type: "MESSAGE", conversationId: conversation.id } });
  return { owner, peer, listing, listingMedia, chatMedia, conversation, message };
}
/** Advances only this fixture's deletion schedule; never changes system clocks or unrelated rows. */
async function makeDue(userId: string) {
  const requestedAt = new Date(Date.now() - 31 * 86400000);
  await fixture.db.user.update({ where: { id: userId }, data: { deletionRequestedAt: requestedAt } });
  await fixture.db.outboxEvent.updateMany({ where: { aggregateId: userId, eventType: "account.delete", status: "PENDING" }, data: { payload: { requestedAt: requestedAt.toISOString() }, nextRetryAt: new Date(0) } });
}
/** Uses the same protected HTTP operation exercised by Angular, including re-authentication. */
async function requestDeletion(user: { username: string }) {
  const issued = await fixture.identity.passwordLogin({ username: user.username, password: "Fixture passphrase 928!" }); const principal = await fixture.sessions.authenticate(issued.accessToken);
  const proof = await fixture.credentials.reauthenticate(principal, { operation: "DELETE_ACCOUNT", password: "Fixture passphrase 928!" });
  const response = await request(fixture.app).post("/api/users/me/deletion").auth(issued.accessToken, { type: "bearer" }).send({ reauthProof: proof.reauthProof });
  expect(response.status).toBe(202); return issued;
}

describe("Account deletion, preservation and crash recovery", () => {
  it("fences a claimed job when its request is cancelled even if a later request reuses the same timestamp", async () => {
    const user = await fixture.user(); await requestDeletion(user); await makeDue(user.id);
    const jobs = new CleanupRepository(fixture.db); const claimed = await jobs.claim();
    if (!claimed) throw new Error("Missing claimed fixture event");
    const requestedAt = (await fixture.db.user.findUniqueOrThrow({ where: { id: user.id } })).deletionRequestedAt;
    const login = await fixture.identity.passwordLogin({ username: user.username, password: "Fixture passphrase 928!" });
    const pending = await fixture.sessions.authenticate(login.accessToken, false); await fixture.deletion.cancel(pending);
    const active = await fixture.sessions.authenticate(login.accessToken);
    const proof = await fixture.credentials.reauthenticate(active, { operation: "DELETE_ACCOUNT", password: "Fixture passphrase 928!" });
    await fixture.deletion.request(active, proof.reauthProof);
    await fixture.db.user.update({ where: { id: user.id }, data: { deletionRequestedAt: requestedAt } });
    await fixture.db.$transaction(async (tx) => { expect(await jobs.current(claimed, tx)).toBe(false); });
    expect((await fixture.db.outboxEvent.findUniqueOrThrow({ where: { id: claimed.id } })).status).toBe("PROCESSED");
    expect((await fixture.db.user.findUniqueOrThrow({ where: { id: user.id } })).status).toBe("PENDING_DELETION");
  });
  it("keeps Listing/Media intact during the grace period, revokes sessions and permits explicit cancellation", async () => {
    const data = await history(); const issued = await requestDeletion(data.owner);
    await expect(fixture.sessions.authenticate(issued.accessToken, false)).rejects.toMatchObject({ status: 401 });
    expect((await fixture.db.listing.findUniqueOrThrow({ where: { id: data.listing.id } })).status).toBe("ACTIVE");
    expect(fixture.objects.has(data.listingMedia.storageKey)).toBe(true);
    expect((await request(fixture.app).get(`/api/users/${data.owner.id}`)).status).toBe(404);
    expect(await fixture.cleanup.runOnce()).toBe(false);
    const login = await fixture.identity.passwordLogin({ username: data.owner.username, password: "Fixture passphrase 928!" });
    expect(login.status).toBe("PENDING_DELETION");
    expect((await request(fixture.app).delete("/api/users/me/deletion").auth(login.accessToken, { type: "bearer" })).status).toBe(204);
    expect((await fixture.db.user.findUniqueOrThrow({ where: { id: data.owner.id } })).status).toBe("ACTIVE");
    await fixture.db.outboxEvent.updateMany({ where: { aggregateId: data.owner.id, eventType: "account.delete" }, data: { nextRetryAt: new Date(0) } });
    await fixture.cleanup.runOnce(); expect((await fixture.db.user.findUniqueOrThrow({ where: { id: data.owner.id } })).status).toBe("ACTIVE");
  });
  it("retries partial storage failures and completes only after cleanup, preserving all Chat content/media", async () => {
    const data = await history(); await requestDeletion(data.owner); await makeDue(data.owner.id);
    fixture.failures.deletion = true; await fixture.cleanup.runOnce();
    expect((await fixture.db.user.findUniqueOrThrow({ where: { id: data.owner.id } })).status).toBe("DELETING");
    const failed = await fixture.db.outboxEvent.findFirstOrThrow({ where: { aggregateId: data.owner.id, eventType: "account.delete" } });
    expect(failed.status).toBe("FAILED"); expect(failed.lastError).toBe("CLEANUP_RETRY");
    await expect(fixture.identity.passwordLogin({ username: data.owner.username, password: "Fixture passphrase 928!" })).rejects.toMatchObject({ status: 401 });
    fixture.failures.deletion = false; await fixture.db.outboxEvent.update({ where: { id: failed.id }, data: { nextRetryAt: new Date(0) } });
    await fixture.cleanup.runOnce();
    const deleted = await fixture.db.user.findUniqueOrThrow({ where: { id: data.owner.id } });
    expect(deleted).toMatchObject({ id: data.owner.id, status: "DELETED", email: null, phone: null, passwordHash: null, avatarMediaId: null, bio: null, provinceId: null });
    expect(deleted.username).not.toBe(data.owner.username);
    const message = await fixture.db.message.findUniqueOrThrow({ where: { id: data.message.id } });
    expect(message.content).toBe(data.message.content); expect(message.senderId).toBe(data.owner.id); expect(message.imageMediaId).toBe(data.chatMedia.id);
    expect(await fixture.db.conversationParticipant.count({ where: { conversationId: data.conversation.id } })).toBe(2);
    expect(fixture.objects.has(data.chatMedia.storageKey)).toBe(true); expect(fixture.deletedKeys).not.toContain(data.chatMedia.storageKey);
    expect((await fixture.db.listing.findUniqueOrThrow({ where: { id: data.listing.id } }))).toMatchObject({ status: "DELETED", contactPhone: null });
    expect(await fixture.db.authSession.count({ where: { userId: data.owner.id } })).toBe(0);
    const profile = await new UserRepository(fixture.db).profile(data.owner.id);
    if (!profile) throw new Error("Missing tombstone");
    expect(publicProfile(profile)).toMatchObject({ displayName: "Tài khoản đã xóa", username: null, avatarUrl: null, bio: null });
    const peerLogin = await fixture.identity.passwordLogin({ username: data.peer.username, password: "Fixture passphrase 928!" }); const peer = await fixture.sessions.authenticate(peerLogin.accessToken);
    await expect(fixture.users.relationship(peer, data.owner.id, "follow")).rejects.toMatchObject({ status: 403 });
    await fixture.db.outboxEvent.update({ where: { id: failed.id }, data: { status: "PROCESSING", lockedUntil: new Date(0) } });
    await fixture.cleanup.runOnce();
    expect((await fixture.db.user.findUniqueOrThrow({ where: { id: data.owner.id } })).username).toBe(deleted.username);
    expect(await fixture.db.processedEvent.count({ where: { eventId: failed.id } })).toBe(1);
    // An isolated restore reconciliation can enqueue cleanup again even if the backup restored PII onto a tombstone.
    await fixture.db.user.update({ where: { id: data.owner.id }, data: { email: data.owner.email, emailVerifiedAt: new Date(), phone: data.owner.phone, phoneVerifiedAt: new Date(), passwordHash: data.owner.passwordHash, bio: "Restored private profile" } });
    await fixture.db.outboxEvent.create({ data: { eventType: "account.delete", aggregateType: "User", aggregateId: data.owner.id, payload: { requestedAt: new Date().toISOString() }, nextRetryAt: new Date(0) } });
    await fixture.cleanup.runOnce();
    expect(await fixture.db.user.findUniqueOrThrow({ where: { id: data.owner.id } })).toMatchObject({ status: "DELETED", email: null, phone: null, passwordHash: null, bio: null });
    expect((await fixture.db.message.findUniqueOrThrow({ where: { id: message.id } })).content).toBe(data.message.content);
    expect(fixture.objects.has(data.chatMedia.storageKey)).toBe(true);
    const replacement = await fixture.user(); await fixture.db.user.update({ where: { id: replacement.id }, data: { username: data.owner.username, email: data.owner.email, emailVerifiedAt: new Date(), phone: data.owner.phone, phoneVerifiedAt: new Date() } });
    expect(replacement.id).not.toBe(data.owner.id); expect((await fixture.db.message.findUniqueOrThrow({ where: { id: message.id } })).senderId).toBe(data.owner.id);
  });
  it("serializes worker transition versus cancellation and allows no recovery from DELETING", async () => {
    const owner = await fixture.user(); await requestDeletion(owner); await makeDue(owner.id);
    const login = await fixture.identity.passwordLogin({ username: owner.username, password: "Fixture passphrase 928!" }); const principal = await fixture.sessions.authenticate(login.accessToken, false);
    const outcomes = await Promise.allSettled([fixture.deletion.cancel(principal), fixture.cleanup.runOnce()]);
    expect(outcomes.some((result) => result.status === "fulfilled")).toBe(true);
    const current = await fixture.db.user.findUniqueOrThrow({ where: { id: owner.id } });
    expect(["ACTIVE", "DELETED"]).toContain(current.status);
    if (current.status === "DELETED") await expect(fixture.deletion.cancel(principal)).rejects.toMatchObject({ status: 401 });
  });
});
