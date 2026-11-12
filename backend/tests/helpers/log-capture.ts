import { Writable } from "node:stream";
import { createLogger } from "../../src/shared/logger/logger";

/** Captures the actual Pino output rather than mocking logger calls or serializers. */
export function captureLogs() {
  const chunks: string[] = [];
  const stream = new Writable({
    /** Keeps the in-memory stream synchronous and bounded to this test fixture. */
    write(chunk: Buffer, _encoding, callback) { chunks.push(chunk.toString()); callback(); },
  });
  return {
    logger: createLogger("info", stream),
    /** Returns emitted JSON lines for safe-field and redaction assertions. */
    text(): string { return chunks.join(""); },
  };
}
