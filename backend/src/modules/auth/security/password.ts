import { hash, verify, argon2id } from "argon2";
import { createHash } from "node:crypto";
import { AppError } from "../../../shared/errors/app-error";
import { unavailable } from "../auth.errors";
import type { PasswordScreen } from "../auth.types";

/** Hashes with Argon2id; the encoded hash carries the salt and work parameters. */
export function hashPassword(password: string): Promise<string> {
  return hash(password, { type: argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 });
}
/** Verifies persisted Argon2 hashes and treats malformed hashes as authentication failure. */
export async function verifyPassword(encoded: string | null, password: string): Promise<boolean> {
  if (!encoded) return false;
  try { return await verify(encoded, password); } catch { return false; }
}
export class PwnedPasswordScreen implements PasswordScreen {
  /** Allows deterministic provider tests while production uses the real range API. */
  constructor(private readonly request: typeof fetch = fetch) {}
  /** Sends only a SHA-1 prefix, requests padding and refuses password changes on provider failure. */
  async check(password: string): Promise<void> {
    const hash = createHash("sha1").update(password).digest("hex").toUpperCase();
    let response: Response;
    try {
      response = await this.request(`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`, {
        headers: { "Add-Padding": "true", "User-Agent": "Looply-Password-Screen" }, signal: AbortSignal.timeout(5000), redirect: "error",
      });
    } catch { throw unavailable(); }
    if (!response.ok) throw unavailable();
    let text: string;
    try { text = await response.text(); } catch { throw unavailable(); }
    const lines = text.trim().split(/\r?\n/);
    if (text.length > 1024 * 1024 || !lines.length || !lines.every((line) => /^[0-9A-F]{35}:[0-9]+$/.test(line))) throw unavailable();
    const breached = lines.some((line) => {
      const [suffix, count] = line.split(":");
      return suffix === hash.slice(5) && Number(count) > 0;
    });
    if (breached) throw new AppError(400, "UNSAFE_PASSWORD", "Choose a password that has not appeared in known breaches.");
  }
}
