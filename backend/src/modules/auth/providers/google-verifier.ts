import { OAuth2Client, type LoginTicket } from "google-auth-library";
import { unauthorized } from "../auth.errors";
import type { GoogleIdentity, GoogleVerifier } from "../auth.types";

export class GoogleOidcVerifier implements GoogleVerifier {
  /** Uses the configured audience; client-supplied email/subject are never trusted. */
  constructor(private readonly clientId: string, private readonly client: { verifyIdToken(options: { idToken: string; audience: string }): Promise<LoginTicket> } = new OAuth2Client({ transporterOptions: { timeout: 5000, retry: false } })) {}
  /** Validates Google's signature/issuer/audience/expiry and the server-issued one-use nonce. */
  async verify(credential: string, nonce: string): Promise<GoogleIdentity> {
    try {
      const ticket = await this.client.verifyIdToken({ idToken: credential, audience: this.clientId });
      const payload = ticket.getPayload();
      if (!payload || !payload.sub || payload.nonce !== nonce || (payload.azp && payload.azp !== this.clientId)) throw unauthorized();
      return { subject: payload.sub, email: payload.email?.trim().toLowerCase(), verified: payload.email_verified === true, name: payload.name };
    } catch { throw unauthorized(); }
  }
}
