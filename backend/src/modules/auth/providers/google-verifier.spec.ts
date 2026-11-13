import { OAuth2Client } from "google-auth-library";
import { beforeAll, describe, expect, it } from "vitest";
import { GoogleOidcVerifier } from "./google-verifier";

let sign: (claims?: {
  issuer?: string;
  audience?: string;
  nonce?: string;
  expiration?: number;
}) => Promise<string>;
let verifier: GoogleOidcVerifier;
beforeAll(async () => {
  const { generateKeyPair, exportSPKI, SignJWT } = await import("jose");
  const keys = await generateKeyPair("RS256");
  const certificate = await exportSPKI(keys.publicKey);
  const sdk = new OAuth2Client();
  // Chỉ thay ranh giới mạng phân phối khóa Google; dùng bộ kiểm tra chữ ký/claim thực của SDK.
  verifier = new GoogleOidcVerifier("fixture-audience", {
    async verifyIdToken(options) {
      return sdk.verifySignedJwtWithCertsAsync(
        options.idToken,
        { fixture: certificate },
        options.audience,
        ["https://accounts.google.com", "accounts.google.com"],
      );
    },
  });
  /** Tạo assertion dạng Google cho test bằng khóa RSA local, không dùng credential Google thật. */
  sign = async (claims = {}) =>
    new SignJWT({
      nonce: claims.nonce ?? "fixture-nonce",
      email: " FIXTURE@EXAMPLE.COM ",
      email_verified: true,
    })
      .setProtectedHeader({ alg: "RS256", kid: "fixture" })
      .setSubject("provider-subject")
      .setIssuer(claims.issuer ?? "https://accounts.google.com")
      .setAudience(claims.audience ?? "fixture-audience")
      .setIssuedAt()
      .setExpirationTime(claims.expiration ?? Math.floor(Date.now() / 1000) + 3600)
      .sign(keys.privateKey);
});

describe("Google OIDC adapter with real SDK verification", () => {
  it("uses verified subject and checks the server nonce", async () => {
    const token = await sign();
    expect(await verifier.verify(token, "fixture-nonce")).toMatchObject({
      subject: "provider-subject",
      email: "fixture@example.com",
      verified: true,
    });
    await expect(verifier.verify(token, "other-nonce")).rejects.toMatchObject({ status: 401 });
  });
  it("rejects incorrect audience, issuer and expired assertions", async () => {
    for (const token of [
      await sign({ audience: "attacker" }),
      await sign({ issuer: "https://attacker.example" }),
      await sign({ expiration: Math.floor(Date.now() / 1000) - 600 }),
    ]) {
      await expect(verifier.verify(token, "fixture-nonce")).rejects.toMatchObject({ status: 401 });
    }
  });
  it("rejects a forged signature rather than trusting decoded email or subject", async () => {
    const token = await sign();
    await expect(
      verifier.verify(
        token.slice(0, token.lastIndexOf(".") + 1) + "invalid-signature",
        "fixture-nonce",
      ),
    ).rejects.toMatchObject({ status: 401 });
  });
});
