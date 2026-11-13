import { randomUUID, createHash } from "node:crypto";
import request from "supertest";
import { z } from "zod";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAuthFixture, type AuthFixture } from "../helpers/auth-fixture";
import { listingContract } from "../helpers/listing-contract";
import { normalizeListingTitle } from "../../src/modules/listing/listing-search";
import { lockResources } from "../../src/shared/database/locks";
import { ListingDiscoveryRepository, discoveryStatement } from "../../src/modules/listing/listing-discovery.repository";
import { Prisma } from "../../src/generated/prisma/client";
import { discoveryQuerySchema } from "../../src/modules/listing/listing-discovery.schema";
import { decodeDiscoveryCursor } from "../../src/modules/listing/listing-discovery-cursor";
import { ListingRepository } from "../../src/modules/listing/listing.repository";

let fixture: AuthFixture;
let owner: Awaited<ReturnType<typeof identity>>;
let viewer: Awaited<ReturnType<typeof identity>>;
let province: Awaited<ReturnType<AuthFixture["province"]>>;
let prefix: string;
beforeEach(async () => { fixture = await createAuthFixture(); owner = await identity(); viewer = await identity(); province = await fixture.province(); prefix = randomUUID(); });
afterEach(async () => { vi.restoreAllMocks(); if (fixture) await fixture.dispose(); });
/** Creates real sessions while avoiding repeated OTP flows outside the discovery responsibility. */
async function identity() { const user = await fixture.user(); const session = await fixture.db.$transaction((tx) => fixture.sessions.create(user, tx)); return { user, token: session.accessToken, principal: await fixture.sessions.authenticate(session.accessToken) }; }
/** Inserts valid, isolated Listing/cover metadata; storage bytes are irrelevant to list-only DTOs. */
async function listing(overrides: Partial<Prisma.ListingUncheckedCreateInput> = {}) {
  const row = await fixture.db.listing.create({ data: { ownerId: owner.user.id, provinceId: province.id, title: `${prefix} ĐỒ ĐẠC`, searchTitle: normalizeListingTitle(`${prefix} ĐỒ ĐẠC`), description: "Nội dung bài đăng đủ dài cho kiểm thử.", type: "SALE", price: "100", createdAt: new Date(Date.now() - 60000), ...overrides } });
  await fixture.db.mediaAsset.create({ data: { uploadedById: row.ownerId, purpose: "LISTING", type: "IMAGE", status: "ATTACHED", listingId: row.id, isCover: true, position: 0, storageKey: `listing/v1/${randomUUID()}`, mimeType: "image/webp", sizeBytes: 100 } });
  return row;
}
/** Sends optional identity exactly as a client would, including anonymous discovery. */
function get(query: object = {}, token?: string, path = "/api/listings") { const call = request(fixture.app).get(path).query(query); return token ? call.auth(token, { type: "bearer" }) : call; }
/** Parses the public response and verifies it against the approved OpenAPI schema. */
function page(body: unknown) { expect(listingContract("ListingPage").safeParse(body).success).toBe(true); return z.object({ data: z.array(z.object({ id: z.uuid(), title: z.string(), isFollowed: z.boolean(), price: z.string().nullable() })), pagination: z.object({ nextCursor: z.string().nullable() }) }).parse(body); }
/** Walks keysets with a bounded request count so a broken continuation cannot hang the suite. */
async function scroll(query: object, token?: string, path = "/api/listings") {
  const ids: string[] = []; const cursors: string[] = []; let after: string | null = null;
  for (let count = 0; count < 100; count++) {
    const result = page((await get({ ...query, ...(after ? { after } : {}) }, token, path).expect(200)).body);
    ids.push(...result.data.map((row) => row.id)); after = result.pagination.nextCursor;
    if (!after) return { ids, cursors };
    cursors.push(after);
  }
  throw new Error("Pagination did not terminate");
}
/** Follows using the mounted authenticated route and no client-supplied ownership. */
function follow(id: string, token = viewer.token) { return request(fixture.app).put(`/api/listings/${id}/follow`).auth(token, { type: "bearer" }); }
/** Unfollows without revealing the existence/state of a foreign resource. */
function unfollow(id: string, token = viewer.token) { return request(fixture.app).delete(`/api/listings/${id}/follow`).auth(token, { type: "bearer" }); }

describe("Listing discovery with real PostgreSQL", () => {
  it("matches Vietnamese composed/decomposed text, d-stroke and case in title only, preserving original title", async () => {
    const title = `${prefix} ĐỒ ĐẠC ĐẸP`; const row = await listing({ title, searchTitle: normalizeListingTitle(title) });
    for (const q of [`${prefix} đồ đạc đẹp`, `${prefix} DO DAC DEP`, `${prefix} ĐỒ ĐẠC ĐẸP`.normalize("NFD")]) {
      const response = await get({ q }).expect(200); expect(response.headers["cache-control"]).toBe("no-store");
      expect(page(response.body).data).toMatchObject([{ id: row.id, title, isFollowed: false }]);
      expect(JSON.stringify(response.body)).not.toMatch(/storageKey|passwordHash|phoneVerifiedAt|emailVerifiedAt|deletionRequestedAt|searchTitle/);
    }
    expect(page((await get({ q: "Nội dung bài đăng đủ dài" }).expect(200)).body).data).toEqual([]);
    expect((await fixture.db.listing.findUniqueOrThrow({ where: { id: row.id } })).title).toBe(title);
  });
  it("treats SQL wildcards, backslash and injection strings as literal text", async () => {
    const title = `${prefix} 100%_\\ bàn`; const row = await listing({ title, searchTitle: normalizeListingTitle(title) });
    await listing();
    expect(page((await get({ q: `${prefix} 100%_\\` }).expect(200)).body).data.map((item) => item.id)).toEqual([row.id]);
    expect(page((await get({ q: `${prefix}' OR 1=1 --` }).expect(200)).body).data).toEqual([]);
    for (const q of ["%", "_", "\\"]) expect(page((await get({ q }).expect(200)).body).data.map((item) => item.id)).toContain(row.id);
  });
  it("filters exact Decimal prices only inside one transaction type/rental unit and combines location/date", async () => {
    const otherProvince = await fixture.province();
    const expected = await listing({ type: "RENT", rentalUnit: "DAY", price: "999999999999998" });
    await listing({ type: "RENT", rentalUnit: "MONTH", price: "999999999999998" });
    await listing({ type: "RENT", rentalUnit: "DAY", price: "999999999999999", provinceId: otherProvince.id });
    await listing({ type: "RENT", rentalUnit: "DAY", price: "999999999999997" });
    await listing({ type: "RENT", rentalUnit: "DAY", price: "999999999999999", createdAt: new Date(Date.now() - 8 * 86400000) });
    await listing({ type: "EXCHANGE", price: null }); await listing({ price: "999999999999998" });
    const response = await get({ q: prefix, type: "RENT", rentalUnit: "DAY", provinceCode: province.code, minPrice: "999999999999998", maxPrice: "999999999999999", postedWithin: "7D", sort: "PRICE_ASC" }).expect(200);
    expect(page(response.body).data).toMatchObject([{ id: expected.id, price: "999999999999998" }]);
    expect(page(response.body).data).toHaveLength(1);
    expect(page((await get({ q: prefix, type: "EXCHANGE" }).expect(200)).body).data).toHaveLength(1);
  });
  it.each(["NEWEST", "OLDEST", "PRICE_ASC", "PRICE_DESC"] as const)("paginates %s without duplicates or omissions when primary keys tie", async (sort) => {
    const rows = []; for (let index = 0; index < 7; index++) rows.push(await listing({ createdAt: new Date("2026-01-01T00:00:00Z"), price: index < 4 ? "999999999999998" : "999999999999999" }));
    const result = await scroll({ q: prefix, type: "SALE", sort, limit: 2 });
    const ascending = sort === "OLDEST" || sort === "PRICE_ASC";
    const ordered = [...rows].sort((a, b) => { const price = sort.startsWith("PRICE_") ? a.price!.comparedTo(b.price!) : 0; const comparison = price || (a.id < b.id ? -1 : 1); return ascending ? comparison : -comparison; });
    expect(result.ids).toEqual(ordered.map((row) => row.id)); expect(new Set(result.ids).size).toBe(rows.length);
  });
  it.each(["24H", "7D", "30D", "ALL"] as const)("anchors the %s time filter to first-page asOf", async (postedWithin) => {
    const hours = postedWithin === "24H" ? 24 : postedWithin === "7D" ? 168 : postedWithin === "30D" ? 720 : 2000;
    const newest = await listing({ createdAt: new Date(Date.now() - 1000) });
    const inside = await listing({ createdAt: new Date(Date.now() - (hours - 1) * 3600000) });
    const outside = await listing({ createdAt: new Date(Date.now() - (hours + 1) * 3600000) });
    const first = page((await get({ q: prefix, postedWithin, limit: 1 }).expect(200)).body);
    const cursor = z.object({ asOf: z.string() }).parse(JSON.parse(Buffer.from(first.pagination.nextCursor!, "base64url").toString()));
    await listing({ createdAt: new Date(Date.parse(cursor.asOf) + 1000) });
    const rest = await scroll({ q: prefix, postedWithin, limit: 1, after: first.pagination.nextCursor });
    expect(first.data.map((row) => row.id)).toEqual([newest.id]);
    expect(rest.ids).toEqual(postedWithin === "ALL" ? [inside.id, outside.id] : [inside.id]);
  });
  it("keeps a deterministic national random order/seed and matches the specified PostgreSQL rank", async () => {
    const rows = []; for (let index = 0; index < 9; index++) rows.push(await listing({ price: "999999999999100" }));
    const query = { feed: "national", type: "SALE", minPrice: "999999999999100", maxPrice: "999999999999100", limit: 2 };
    const result = await scroll(query); const cursor = z.object({ seed: z.string() }).parse(JSON.parse(Buffer.from(result.cursors[0]!, "base64url").toString()));
    const ordered = rows.map((row) => ({ id: row.id, rank: createHash("md5").update(`${cursor.seed}:${row.id}`).digest("hex") })).sort((a, b) => a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : a.id < b.id ? -1 : 1);
    expect(result.ids).toEqual(ordered.map((row) => row.id));
    for (const token of result.cursors) expect(JSON.parse(Buffer.from(token, "base64url").toString()).seed).toBe(cursor.seed);
    const repeat = await get({ ...query, after: result.cursors[0] }).expect(200);
    expect(page(repeat.body).data.map((row) => row.id)).toEqual(result.ids.slice(2, 4));
  });
  it("returns at most eight compact suggestions, empty query [], and excludes nonpublic owners/rows", async () => {
    for (let i = 0; i < 10; i++) await listing();
    await listing({ status: "HIDDEN" }); await listing({ status: "DELETED", deletedAt: new Date() });
    const response = await get({ q: `${prefix} do dac` }, undefined, "/api/listings/suggestions").expect(200);
    expect(listingContract("ListingSuggestions").safeParse(response.body).success).toBe(true);
    expect(response.body.data).toHaveLength(8); expect(Object.keys(response.body.data[0]).sort()).toEqual(["id", "title"]);
    expect((await get({}, undefined, "/api/listings/suggestions").expect(200)).body).toEqual({ data: [] });
    await fixture.db.user.update({ where: { id: owner.user.id }, data: { status: "PENDING_DELETION", deletionRequestedAt: new Date() } });
    expect((await get({ q: prefix }, undefined, "/api/listings/suggestions").expect(200)).body.data).toEqual([]);
  });
  it("requires explicit nearby location for guest and signed-in viewer and never copies profile location", async () => {
    const expected = await listing(); const other = await fixture.province(); await listing({ provinceId: other.id });
    await fixture.db.user.update({ where: { id: viewer.user.id }, data: { provinceId: other.id } });
    for (const token of [undefined, viewer.token]) {
      await get({ feed: "nearby" }, token).expect(400);
      expect(page((await get({ feed: "nearby", provinceCode: province.code }, token).expect(200)).body).data.map((row) => row.id)).toEqual([expected.id]);
    }
  });
  it("rejects mismatched cursors and malicious/invalid query combinations at the HTTP boundary", async () => {
    await listing(); await listing(); const query = { q: prefix, limit: 1 };
    const after = page((await get(query).expect(200)).body).pagination.nextCursor;
    for (const change of [{ q: "different" }, { limit: 2 }, { sort: "OLDEST" }, { type: "SALE" }, { provinceCode: province.code }, { postedWithin: "7D" }]) await get({ ...query, ...change, after }).expect(400);
    await get({ ...query, after }, viewer.token).expect(400);
    await get({ limit: 1, after }, undefined, `/api/users/${owner.user.id}/listings`).expect(400);
    for (const invalid of [{ after: "bad" }, { seed: "abc" }, { minPrice: "1" }, { type: "RENT", sort: "PRICE_DESC" }, { type: "EXCHANGE", minPrice: "1" }, { type: "SALE", minPrice: "2", maxPrice: "1" }, { type: "SALE", minPrice: "1", maxPrice: "1e3" }, { limit: 49 }, { feed: "national", q: prefix }, { feed: "national", provinceCode: province.code }]) {
      const response = await get(invalid).expect(400); expect(response.body.error.code).toBe("VALIDATION_ERROR");
    }
    await request(fixture.app).get("/api/listings?q=a&q=b").expect(400);
  });
  it("rechecks visibility, both Block directions and owner lifecycle on subsequent pages and public-user lists", async () => {
    const rows = []; for (let i = 0; i < 4; i++) rows.push(await listing());
    const query = { q: prefix, limit: 1 }; const first = page((await get(query, viewer.token).expect(200)).body);
    const remaining = rows.filter((row) => row.id !== first.data[0]!.id);
    await fixture.db.listing.update({ where: { id: remaining[0]!.id }, data: { status: "HIDDEN" } });
    await fixture.db.listing.update({ where: { id: remaining[1]!.id }, data: { status: "DELETED", deletedAt: new Date() } });
    expect(page((await get({ ...query, after: first.pagination.nextCursor }, viewer.token).expect(200)).body).data.map((row) => row.id)).toEqual([remaining[2]!.id]);
    for (const [from, to] of [[owner, viewer], [viewer, owner]]) {
      await fixture.users.relationship(from!.principal, to!.user.id, "block");
      expect(page((await get({ q: prefix }, viewer.token).expect(200)).body).data).toEqual([]);
      expect((await get({ q: prefix }, viewer.token, "/api/listings/suggestions").expect(200)).body.data).toEqual([]);
      await get({}, viewer.token, `/api/users/${owner.user.id}/listings`).expect(404);
      await fixture.users.relationship(from!.principal, to!.user.id, "unblock");
    }
    expect(page((await get({}, owner.token, `/api/users/${owner.user.id}/listings`).expect(200)).body).data).toHaveLength(2);
    for (const status of ["PENDING_DELETION", "DELETING", "DELETED"] as const) {
      await fixture.db.user.update({ where: { id: owner.user.id }, data: { status, deletionRequestedAt: new Date() } });
      expect(page((await get({ q: prefix }).expect(200)).body).data).toEqual([]);
    }
  });
  it("does not expose stale candidate IDs if a Listing becomes hidden before hydration", async () => {
    const row = await listing(); const original = ListingDiscoveryRepository.prototype.rows;
    vi.spyOn(ListingDiscoveryRepository.prototype, "rows").mockImplementationOnce(async (ids, id, followed, tx) => {
      await fixture.db.listing.update({ where: { id: row.id }, data: { status: "HIDDEN" } });
      return original.call(new ListingDiscoveryRepository(), ids, id, followed, tx);
    });
    expect(page((await get({ q: prefix }).expect(200)).body).data).toEqual([]);
  });
  it("measures actual bounded search/nearby/random plans on 2,000 isolated Listing rows", async () => {
    await fixture.db.listing.createMany({ data: Array.from({ length: 2000 }, (_, index) => ({ id: randomUUID(), ownerId: owner.user.id, provinceId: province.id, title: `${prefix} Test ${index}`, searchTitle: `${prefix} test ${index}`, description: "Query plan fixture with valid content.", type: "SALE" as const, price: "100", createdAt: new Date(Date.now() - 60000 - index) })) });
    for (const input of [{ q: `${prefix} test 1999` }, { feed: "nearby", provinceCode: province.code }, { feed: "national" }]) {
      const query = discoveryQuerySchema.parse(input); const cursor = decodeDiscoveryCursor(query, "discovery", null, new Date());
      const plan = await fixture.db.$queryRaw(Prisma.sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${discoveryStatement(query, cursor)}`);
      const parsed = z.array(z.object({ "QUERY PLAN": z.array(z.object({ Plan: z.object({ "Node Type": z.string(), "Actual Rows": z.number() }).passthrough(), "Execution Time": z.number() })) })).parse(plan);
      const root = parsed[0]!["QUERY PLAN"][0]!;
      expect(root.Plan["Node Type"]).toBe("Limit"); expect(root.Plan["Actual Rows"]).toBeLessThanOrEqual(13);
      const text = JSON.stringify(root.Plan); const indexes = [...text.matchAll(/"Index Name":"([^"]+)"/g)].map((match) => match[1]);
      console.log(JSON.stringify({ discoveryPlan: query.feed, sort: query.sort, rows: root.Plan["Actual Rows"], executionMs: root["Execution Time"], indexes, topNSort: text.includes("top-N heapsort") }));
    }
  });
});

describe("Listing Follow with real PostgreSQL", () => {
  it("is idempotent under concurrent follows, projects isFollowed and changes neither Listing version nor events", async () => {
    const row = await listing(); const before = await fixture.db.outboxEvent.count(); const notifications = await fixture.db.notification.count();
    const results = await Promise.all(Array.from({ length: 8 }, () => follow(row.id))); expect(results.map((result) => result.status)).toEqual(Array(8).fill(204));
    expect(await fixture.db.listingFollow.count({ where: { listingId: row.id, userId: viewer.user.id } })).toBe(1);
    expect((await fixture.db.listing.findUniqueOrThrow({ where: { id: row.id } })).version).toBe(1);
    expect(await fixture.db.outboxEvent.count()).toBe(before); expect(await fixture.db.notification.count()).toBe(notifications);
    expect(page((await get({ q: prefix }, viewer.token).expect(200)).body).data[0]!.isFollowed).toBe(true);
    expect(page((await get({ q: prefix }).expect(200)).body).data[0]!.isFollowed).toBe(false);
    expect(page((await get({}, viewer.token, "/api/users/me/followed-listings").expect(200)).body).data.map((item) => item.id)).toEqual([row.id]);
    await unfollow(row.id).expect(204); await unfollow(row.id).expect(204);
    expect(await fixture.db.listingFollow.count({ where: { listingId: row.id } })).toBe(0);
  });
  it("retains hidden follows, restores them after reopen, and allows invisible/deleted/missing unfollow", async () => {
    const row = await listing(); await follow(row.id).expect(204);
    await fixture.listings.visibility(row.id, owner.principal, { expectedVersion: 1, status: "HIDDEN" });
    await follow(row.id).expect(404);
    expect(await fixture.db.listingFollow.count({ where: { listingId: row.id } })).toBe(1);
    expect(page((await get({}, viewer.token, "/api/users/me/followed-listings").expect(200)).body).data).toEqual([]);
    await fixture.listings.visibility(row.id, owner.principal, { expectedVersion: 2, status: "ACTIVE" });
    expect(page((await get({}, viewer.token, "/api/users/me/followed-listings").expect(200)).body).data).toHaveLength(1);
    await fixture.listings.visibility(row.id, owner.principal, { expectedVersion: 3, status: "HIDDEN" }); await unfollow(row.id).expect(204);
    await fixture.listings.remove(row.id, owner.principal, 4); await follow(row.id).expect(404); await unfollow(row.id).expect(204); await unfollow(randomUUID()).expect(204);
  });
  it("enforces auth/account/self/block gates without disclosing private rows and only removes own relations", async () => {
    const row = await listing(); await follow(row.id, owner.token).expect(403); await follow(randomUUID()).expect(404);
    await request(fixture.app).put(`/api/listings/${row.id}/follow`).expect(401);
    for (const path of ["/api/listings", "/api/listings/suggestions", "/api/users/me/followed-listings"]) await get({}, "invalid-token", path).expect(401);
    for (const [from, to] of [[owner, viewer], [viewer, owner]]) { await fixture.users.relationship(from!.principal, to!.user.id, "block"); await follow(row.id).expect(404); await unfollow(row.id).expect(204); await fixture.users.relationship(from!.principal, to!.user.id, "unblock"); }
    const other = await identity(); await follow(row.id, other.token).expect(204); await unfollow(row.id).expect(204);
    expect(await fixture.db.listingFollow.count({ where: { listingId: row.id, userId: other.user.id } })).toBe(1);
    await fixture.db.user.update({ where: { id: viewer.user.id }, data: { status: "PENDING_DELETION", deletionRequestedAt: new Date() } });
    await follow(row.id).expect(403); await unfollow(row.id).expect(403); await get({}, viewer.token).expect(403);
  });
  it("paginates followed Listings by Listing creation time with viewer/scope binding", async () => {
    const rows = []; for (let i = 0; i < 5; i++) rows.push(await listing({ createdAt: new Date("2026-01-01T00:00:00Z") }));
    for (const row of rows) await follow(row.id).expect(204);
    const result = await scroll({ limit: 2 }, viewer.token, "/api/users/me/followed-listings");
    expect(result.ids).toEqual(rows.map((row) => row.id).sort().reverse());
    await get({ limit: 2, after: result.cursors[0] }, owner.token, "/api/users/me/followed-listings").expect(400);
    await get({ limit: 2, after: result.cursors[0] }, viewer.token, `/api/users/${owner.user.id}/listings`).expect(400);
    await get({}, undefined, "/api/users/me/followed-listings").expect(401);
  });
  it.each(["hide", "delete", "block", "pending"] as const)("serializes follow racing with %s using the same User/Listing locks", async (operation) => {
    const row = await listing();
    const change = operation === "hide" ? fixture.listings.visibility(row.id, owner.principal, { expectedVersion: 1, status: "HIDDEN" }) : operation === "delete" ? fixture.listings.remove(row.id, owner.principal, 1) : operation === "block" ? fixture.users.relationship(owner.principal, viewer.user.id, "block") : fixture.db.$transaction(async (tx) => { await lockResources(tx, [`user:${owner.user.id}`]); await tx.user.update({ where: { id: owner.user.id }, data: { status: "PENDING_DELETION", deletionRequestedAt: new Date() } }); });
    const [result] = await Promise.all([follow(row.id), change]); expect([204, 404]).toContain(result.status);
    await follow(row.id).expect(404);
    expect(page((await get({}, viewer.token, "/api/users/me/followed-listings").expect(200)).body).data).toEqual([]);
    await unfollow(row.id).expect(204);
  });
  it("serializes concurrent follow/unfollow with at most one retained relation", async () => {
    const row = await listing(); const results = await Promise.all([follow(row.id), unfollow(row.id), follow(row.id), unfollow(row.id)]);
    expect(results.map((result) => result.status)).toEqual([204, 204, 204, 204]);
    expect(await fixture.db.listingFollow.count({ where: { listingId: row.id, userId: viewer.user.id } })).toBeLessThanOrEqual(1);
    await unfollow(row.id).expect(204); expect(await fixture.db.listingFollow.count({ where: { listingId: row.id } })).toBe(0);
  });
  it.each(["revoked", "hidden", "pending"] as const)("rereads %s state after waiting for the actual advisory locks", async (state) => {
    const row = await listing();
    let release!: () => void; let held!: () => void; let reached!: () => void;
    const released = new Promise<void>((resolve) => { release = resolve; });
    const locked = new Promise<void>((resolve) => { held = resolve; });
    const queued = new Promise<void>((resolve) => { reached = resolve; });
    const holder = fixture.db.$transaction(async (tx) => {
      await lockResources(tx, [owner.user.id, viewer.user.id].map((id) => `user:${id}`));
      await lockResources(tx, [`listing:${row.id}`]); held(); await released;
      if (state === "revoked") await tx.authSession.updateMany({ where: { userId: viewer.user.id }, data: { revokedAt: new Date() } });
      else if (state === "pending") await tx.user.update({ where: { id: owner.user.id }, data: { status: "PENDING_DELETION", deletionRequestedAt: new Date() } });
      else await tx.listing.update({ where: { id: row.id }, data: { status: "HIDDEN" } });
    });
    await locked;
    const original = ListingRepository.prototype.lockUsers;
    vi.spyOn(ListingRepository.prototype, "lockUsers").mockImplementationOnce((ids, tx) => { reached(); return original.call(new ListingRepository(fixture.db), ids, tx); });
    const pending = follow(row.id).then((response) => response);
    try { await queued; } finally { release(); }
    await holder; expect((await pending).status).toBe(state === "revoked" ? 401 : 404);
    expect(await fixture.db.listingFollow.count({ where: { listingId: row.id } })).toBe(0);
  });
});
