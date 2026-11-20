import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";

const root = resolve(__dirname, "../../../..");
const document = z
  .record(z.string(), z.unknown())
  .parse(JSON.parse(readFileSync(resolve(root, "docs/api/openapi.json"), "utf8")));

/** Duyệt mọi giá trị lồng nhau để kiểm tra tham chiếu trong schema request, response và nullable. */
function visit(value: unknown, references: string[]): void {
  if (Array.isArray(value)) {
    for (const item of value) visit(item, references);
    return;
  }
  if (typeof value !== "object" || value === null) return;
  const record = z.record(z.string(), z.unknown()).parse(value);
  if (typeof record.$ref === "string") references.push(record.$ref);
  for (const item of Object.values(record)) visit(item, references);
}

/** Chuyển component OpenAPI local sang định nghĩa JSON Schema bằng bộ chuyển đổi Zod đã cài. */
function contractSchema(name: string): z.ZodType {
  const components = z
    .object({ schemas: z.record(z.string(), z.unknown()) })
    .parse(document.components);
  const schema = z.record(z.string(), z.unknown()).parse(
    JSON.parse(
      JSON.stringify({
        $ref: `#/$defs/${name}`,
        $defs: components.schemas,
      }).replaceAll("#/components/schemas/", "#/$defs/"),
    ),
  );
  return z.fromJSONSchema(schema);
}

describe("OpenAPI and runtime route contract", () => {
  it("rejects upload DTOs with an impossible media type, MIME or duration combination", () => {
    const schema = contractSchema("ListingUpload");
    const image = {
      id: "d2a6a3ba-22be-45f9-84cc-53c5929d33d3",
      status: "TEMP",
      type: "IMAGE",
      mimeType: "image/webp",
      sizeBytes: "1024",
      durationSeconds: null,
      expiresAt: "2026-11-13T00:15:00Z",
    };
    const video = { ...image, type: "VIDEO", mimeType: "video/mp4", durationSeconds: 180 };
    expect(schema.safeParse(image).success).toBe(true);
    expect(schema.safeParse(video).success).toBe(true);
    for (const invalid of [
      { ...video, durationSeconds: null },
      { ...video, mimeType: "image/webp" },
      { ...image, durationSeconds: 1 },
      { ...image, mimeType: "video/webm" },
    ]) {
      expect(schema.safeParse(invalid).success, JSON.stringify(invalid)).toBe(false);
    }
  });
  it("allows only an IMAGE cover and a gallery with 1-5 images, at most one video and exactly one cover", () => {
    const id = "d2a6a3ba-22be-45f9-84cc-53c5929d33d3";
    const cover = {
      id,
      type: "IMAGE",
      mimeType: "image/webp",
      sizeBytes: "1024",
      durationSeconds: null,
      position: 0,
      isCover: true,
      deliveryPath: `/api/listings/${id}/media/${id}`,
    };
    const videoId = "d2a6a3ba-22be-45f9-84cc-53c5929d33d4";
    const video = {
      ...cover,
      id: videoId,
      type: "VIDEO",
      mimeType: "video/webm",
      durationSeconds: 1,
      position: null,
      isCover: false,
      deliveryPath: `/api/listings/${id}/media/${videoId}`,
    };
    const item = {
      id,
      title: "Xe dap thanh pho",
      type: "SALE",
      status: "ACTIVE",
      price: "100",
      rentalUnit: null,
      province: { code: "79", name: "Ho Chi Minh" },
      owner: {
        id,
        username: "owner",
        displayName: "Owner",
        bio: null,
        province: null,
        avatarUrl: null,
        followers: 0,
        following: 0,
      },
      cover,
      isFollowed: false,
      createdAt: "2026-11-13T00:00:00Z",
      updatedAt: "2026-11-13T00:00:00Z",
    };
    const itemSchema = contractSchema("ListingItem");
    expect(itemSchema.safeParse(item).success).toBe(true);
    expect(itemSchema.safeParse({ ...item, cover: video }).success).toBe(false);
    expect(itemSchema.safeParse({ ...item, cover: { ...cover, isCover: false } }).success).toBe(
      false,
    );
    const detail = {
      ...item,
      description: "Xe dap thanh pho con rat tot.",
      contactPhone: null,
      media: [cover, video],
      version: 1,
      activeCycle: 1,
      hasConversations: false,
      hasAcceptedProposal: false,
    };
    const detailSchema = contractSchema("ListingDetail");
    expect(detailSchema.safeParse(detail).success).toBe(true);
    for (const media of [
      [video],
      [cover, video, video],
      [cover, cover],
      [{ ...cover, isCover: false }],
      [cover, ...Array.from({ length: 5 }, () => ({ ...cover, isCover: false }))],
    ]) {
      expect(detailSchema.safeParse({ ...detail, media }).success).toBe(false);
    }
  });
  it("resolves every local schema/response reference and keeps operation IDs unique", () => {
    const references: string[] = [];
    visit(document, references);
    for (const reference of references) {
      expect(reference).toMatch(/^#\//);
      let value: unknown = document;
      for (const part of reference.slice(2).split("/"))
        value = z.record(z.string(), z.unknown()).parse(value)[part];
      expect(value, reference).toBeDefined();
    }
    const ids: string[] = [];
    for (const path of Object.values(
      z.record(z.string(), z.record(z.string(), z.unknown())).parse(document.paths),
    )) {
      for (const operation of Object.values(path))
        ids.push(z.object({ operationId: z.string() }).parse(operation).operationId);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("explicitly classifies every operation and labels planned operations as unavailable", () => {
    const paths = z.record(z.string(), z.record(z.string(), z.unknown())).parse(document.paths);
    for (const methods of Object.values(paths)) {
      for (const operation of Object.values(methods)) {
        const classified = z
          .object({
            "x-implementation-status": z.enum(["implemented", "planned"]),
            summary: z.string(),
          })
          .parse(operation);
        if (classified["x-implementation-status"] === "planned") {
          expect(classified.summary).toMatch(/^\[PLANNED\]/);
        }
      }
    }
  });
  it("documents exactly the registered Core/Auth/User routes, including avatar and deletion", () => {
    const files = [
      "routes/health.routes.ts",
      "modules/auth/auth.routes.ts",
      "modules/user/user.routes.ts",
      "modules/user/avatar.routes.ts",
      "modules/user/deletion/deletion.routes.ts",
      "modules/listing/listing.routes.ts",
      "modules/listing/listing-discovery.routes.ts",
      "modules/media/listing-upload.routes.ts",
      "modules/chat/chat.routes.ts",
      "modules/notification/notification.routes.ts",
    ];
    const actual: string[] = [];
    for (const file of files) {
      const text = readFileSync(resolve(root, "backend/src", file), "utf8");
      for (const match of text.matchAll(/router\.(get|post|put|patch|delete)\(\s*"([^"]+)"/g))
        actual.push(`${match[1]} /api${match[2].replace(/:([A-Za-z][A-Za-z0-9]*)/g, "{$1}")}`);
    }
    const specified: string[] = [];
    for (const [path, methods] of Object.entries(
      z.record(z.string(), z.record(z.string(), z.unknown())).parse(document.paths),
    )) {
      for (const [method, operation] of Object.entries(methods)) {
        const classified = z
          .object({ "x-implementation-status": z.enum(["implemented", "planned"]) })
          .parse(operation);
        const route = `${method} ${path}`;
        if (classified["x-implementation-status"] === "implemented") specified.push(route);
        else
          expect(actual, `Registered route must be classified implemented: ${route}`).not.toContain(
            route,
          );
      }
    }
    expect(actual.sort()).toEqual(specified.sort());
  });
});
