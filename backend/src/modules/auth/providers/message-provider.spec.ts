import { describe, expect, it } from "vitest";
import { HttpMessageProvider } from "./message-provider";

describe("Message gateway adapter", () => {
  it("sends codes only to the configured authenticated gateway with an explicit lifetime", async () => {
    const provider = new HttpMessageProvider(
      "https://gateway.example/send",
      "fixture-gateway-key",
      async (url, options) => {
        expect(String(url)).toBe("https://gateway.example/send");
        expect(options?.headers).toMatchObject({ Authorization: "Bearer fixture-gateway-key" });
        expect(JSON.parse(String(options?.body))).toEqual({
          destination: "+84912345678",
          code: "123456",
          expiresIn: 300,
        });
        expect(options?.redirect).toBe("error");
        return new Response(null, { status: 202 });
      },
    );
    await expect(provider.send("+84912345678", "123456")).resolves.toBeUndefined();
  });
  it("does not expose provider errors, credentials or codes when delivery fails", async () => {
    const provider = new HttpMessageProvider(
      "https://gateway.example/send",
      "fixture-key",
      async () => {
        throw new Error("sensitive provider content 123456");
      },
    );
    await expect(provider.send("+84912345678", "123456")).rejects.toMatchObject({
      status: 503,
      message: "Authentication is temporarily unavailable.",
    });
  });
});
