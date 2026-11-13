import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { z } from "zod";

const schema = z.object({
  MEDIA_FFPROBE_PATH: z.string().min(1).default("ffprobe"),
  MEDIA_FFMPEG_PATH: z.string().min(1).default("ffmpeg"),
  MEDIA_VIDEO_BINARY_VERSION: z.string().min(1).default("n8.1.3-35-gf1acb0a266"),
  MEDIA_STAGING_DIRECTORY: z.string().min(1).default(resolve(tmpdir(), "looply-private-staging")),
  MEDIA_VIDEO_TIMEOUT_MS: z.coerce.number().int().min(100).max(300000).default(60000),
  MEDIA_UPLOAD_TIMEOUT_MS: z.coerce.number().int().min(1000).max(600000).default(120000),
  MEDIA_UPLOAD_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(2),
});
/** Reads bounded video settings without requiring a machine-specific executable path. */
export function videoConfig(environment: NodeJS.ProcessEnv = process.env) { return schema.parse(environment); }
export const maxVideoBytes = 100 * 1024 * 1024;
