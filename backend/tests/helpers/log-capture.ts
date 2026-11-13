import { Writable } from "node:stream";
import { createLogger } from "../../src/shared/logger/logger";

/** Thu đầu ra Pino thực thay vì mock lời gọi logger hoặc serializer. */
export function captureLogs() {
  const chunks: string[] = [];
  const stream = new Writable({
    /** Giữ stream trong bộ nhớ đồng bộ và giới hạn trong fixture test này. */
    write(chunk: Buffer, _encoding, callback) {
      chunks.push(chunk.toString());
      callback();
    },
  });
  return {
    logger: createLogger("info", stream),
    /** Trả các dòng JSON đã phát để kiểm tra trường an toàn và redaction. */
    text(): string {
      return chunks.join("");
    },
  };
}
