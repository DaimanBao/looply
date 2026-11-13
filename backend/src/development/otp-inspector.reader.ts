import { z } from "zod";
import type { FakeMessageProvider } from "../modules/auth/providers/message-provider";
import { otpDigest } from "../modules/auth/security/random";
import type { ScriptStore } from "../modules/auth/redis/redis-store";

const storedSchema = z.object({
  binding: z.string(),
  hash: z.string(),
  identity: z.string(),
});
const liveChallenge = `
local raw=redis.call('GET',KEYS[1])
if not raw then return nil end
local challenge=cjson.decode(raw)
if redis.call('EXISTS',challenge.identity..':lock')==1 then return nil end
if redis.call('GET',challenge.identity..':current')~=KEYS[1] then return nil end
return raw`;
export interface InspectorDependencies {
  store: ScriptStore;
  sms: FakeMessageProvider;
  email: FakeMessageProvider;
  pepper: string;
  namespace?: string;
}

/** Đọc challenge còn hiệu lực mà không đổi TTL/số lần thử, rồi đối chiếu chính xác bản gửi trong bộ nhớ. */
export async function inspectOtp(
  input: { challengeId: string; destination: string },
  dependencies: InspectorDependencies,
): Promise<string | undefined> {
  const raw = await dependencies.store.eval(
    liveChallenge,
    [`${dependencies.namespace ?? "looply:auth:"}otp:${input.challengeId}`],
    [],
  );
  const stored = typeof raw === "string" ? storedSchema.parse(JSON.parse(raw)) : undefined;
  if (!stored) return undefined;
  const binding = z.object({ destination: z.string() }).parse(JSON.parse(stored.binding));
  const code = (input.destination.includes("@") ? dependencies.email : dependencies.sms).lastCode(
    input.destination,
  );
  if (
    binding.destination !== input.destination ||
    !code ||
    otpDigest(dependencies.pepper, stored.binding + input.challengeId, code) !== stored.hash
  )
    return undefined;
  return code;
}
