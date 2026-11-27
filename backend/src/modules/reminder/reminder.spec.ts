import { describe, expect, it } from "vitest";
import { missingProfileFields } from "./reminder.service";

describe("Reminder profile rules", () => {
  it("requires both a contact value and verification, and never an avatar", () => {
    expect(
      missingProfileFields({
        phone: null,
        phoneVerifiedAt: new Date(),
        email: "a@example.test",
        emailVerifiedAt: null,
        province: null,
      }),
    ).toEqual(["PHONE", "EMAIL", "PROVINCE"]);
    expect(
      missingProfileFields({
        phone: "+84912345678",
        phoneVerifiedAt: new Date(),
        email: "a@example.test",
        emailVerifiedAt: new Date(),
        province: { code: "01" },
      }),
    ).toEqual([]);
  });

  it("evaluates all eight combinations without duplicate items", () => {
    for (let mask = 0; mask < 8; mask++) {
      const fields = missingProfileFields({
        phone: mask & 1 ? "+84912345678" : null,
        phoneVerifiedAt: mask & 1 ? new Date() : null,
        email: mask & 2 ? "a@example.test" : null,
        emailVerifiedAt: mask & 2 ? new Date() : null,
        province: mask & 4 ? { code: "01" } : null,
      });
      expect(fields.includes("PHONE")).toBe(!(mask & 1));
      expect(fields.includes("EMAIL")).toBe(!(mask & 2));
      expect(fields.includes("PROVINCE")).toBe(!(mask & 4));
      expect(new Set(fields).size).toBe(fields.length);
    }
  });
});
