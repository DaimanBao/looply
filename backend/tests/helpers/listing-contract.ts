import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

const document = z
  .object({ components: z.object({ schemas: z.record(z.string(), z.unknown()) }) })
  .parse(JSON.parse(readFileSync(resolve(__dirname, "../../../docs/api/openapi.json"), "utf8")));
const cache = new Map<string, z.ZodType>();
/** Kiểm tra HTTP response thật theo schema component đã duyệt bằng bộ chuyển đổi đã cài. */
export function listingContract(name: string): z.ZodType {
  const existing = cache.get(name);
  if (existing) return existing;
  const schema = z
    .record(z.string(), z.unknown())
    .parse(
      JSON.parse(
        JSON.stringify({ $ref: `#/$defs/${name}`, $defs: document.components.schemas }).replaceAll(
          "#/components/schemas/",
          "#/$defs/",
        ),
      ),
    );
  const validator = z.fromJSONSchema(schema);
  cache.set(name, validator);
  return validator;
}
