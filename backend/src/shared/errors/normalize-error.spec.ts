import { describe, expect, it } from "vitest";
import { Prisma } from "../../generated/prisma/client";
import { AppError } from "./app-error";
import { normalizeError } from "./normalize-error";

describe("Public error mapping", () => {
  // Expected application errors keep their intentional public identity.
  it.each([400, 401, 403, 404, 409])("preserves explicit application status %s", (status) => {
    const failure = new AppError(status, "APPLICATION_FAILURE", "A safe message");
    expect(normalizeError(failure)).toBe(failure);
  });

  // Real Prisma error instances exercise instanceof mapping without opening a database.
  it.each([
    ["P2000", 400, "VALIDATION_ERROR"], ["P2002", 409, "CONFLICT"],
    ["P2003", 409, "REFERENCE_CONFLICT"], ["P2025", 404, "NOT_FOUND"],
    ["P2034", 409, "CONCURRENT_MODIFICATION"], ["P2024", 503, "DATABASE_UNAVAILABLE"],
  ] as const)("maps Prisma %s to %s", (code, status, publicCode) => {
    const failure = new Prisma.PrismaClientKnownRequestError("private SQL and parameters", { code, clientVersion: "7.10.1", meta: { target: "private_table" } });
    expect(normalizeError(failure)).toMatchObject({ status, code: publicCode });
    expect(normalizeError(failure).message).not.toContain("private");
  });

  // Unknown Prisma failures and arbitrary thrown values are treated as internal errors.
  it.each([new Error("private-password"), "private-token", null, { code: "P2002", message: "not a Prisma error" }, new Prisma.PrismaClientKnownRequestError("private SQL", { code: "P9999", clientVersion: "7.10.1" })])("hides arbitrary failure case %#", (error) => {
    expect(normalizeError(error)).toMatchObject({ status: 500, code: "INTERNAL_ERROR", message: "An unexpected error occurred." });
  });

  // Startup errors cannot disclose a connection string through an HTTP response.
  it("maps Prisma initialization failure safely", () => {
    const failure = new Prisma.PrismaClientInitializationError("private connection", "7.10.1", "P1001");
    expect(normalizeError(failure)).toMatchObject({ status: 503, code: "DATABASE_UNAVAILABLE" });
  });
});
