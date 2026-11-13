import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";

const root = resolve(__dirname, "../../../..");
const document = z.record(z.string(), z.unknown()).parse(JSON.parse(readFileSync(resolve(root, "docs/api/openapi.json"), "utf8")));

/** Visits every nested value so references inside request, response and nullable schemas are checked. */
function visit(value: unknown, references: string[]): void {
  if (Array.isArray(value)) { for (const item of value) visit(item, references); return; }
  if (typeof value !== "object" || value === null) return;
  const record = z.record(z.string(), z.unknown()).parse(value);
  if (typeof record.$ref === "string") references.push(record.$ref);
  for (const item of Object.values(record)) visit(item, references);
}

describe("OpenAPI and runtime route contract", () => {
  it("resolves every local schema/response reference and keeps operation IDs unique", () => {
    const references: string[] = []; visit(document, references);
    for (const reference of references) {
      expect(reference).toMatch(/^#\//); let value: unknown = document;
      for (const part of reference.slice(2).split("/")) value = z.record(z.string(), z.unknown()).parse(value)[part];
      expect(value, reference).toBeDefined();
    }
    const ids: string[] = [];
    for (const path of Object.values(z.record(z.string(), z.record(z.string(), z.unknown())).parse(document.paths))) {
      for (const operation of Object.values(path)) ids.push(z.object({ operationId: z.string() }).parse(operation).operationId);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("documents exactly the registered Core/Auth/User routes, including avatar and deletion", () => {
    const files = ["routes/health.routes.ts", "modules/auth/auth.routes.ts", "modules/user/user.routes.ts", "modules/user/avatar.routes.ts", "modules/user/deletion/deletion.routes.ts"];
    const actual: string[] = [];
    for (const file of files) {
      const text = readFileSync(resolve(root, "backend/src", file), "utf8");
      for (const match of text.matchAll(/router\.(get|post|put|patch|delete)\("([^"]+)"/g)) actual.push(`${match[1]} /api${match[2].replace(/:([A-Za-z][A-Za-z0-9]*)/g, "{$1}")}`);
    }
    const specified: string[] = [];
    for (const [path, methods] of Object.entries(z.record(z.string(), z.record(z.string(), z.unknown())).parse(document.paths))) for (const method of Object.keys(methods)) specified.push(`${method} ${path}`);
    expect(actual.sort()).toEqual(specified.sort());
  });
});
