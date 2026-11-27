import { mkdir, readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const version = "n8.1.3-35-gf1acb0a266";
const release = "autobuild-2026-11-17-12-40";
const platforms = {
  win32: {
    asset: `ffmpeg-${version}-win64-gpl-8.1.zip`,
    sha256: "5e50099d2ad086f193889452e98bce6f5ece36e852b2390769707c3afa39659b",
  },
  linux: {
    asset: `ffmpeg-${version}-linux64-gpl-8.1.tar.xz`,
    sha256: "4f88dca1e0e3079b0e8ba59a74a5bbdb8c89086a1508630616df76a56b0e0e55",
  },
};
/** Chỉ chuẩn bị release đã review, kiểm tra digest đã pin trước giải nén hoặc thực thi. */
async function main() {
  const platform = platforms[process.platform];
  if (!platform || process.arch !== "x64")
    throw new Error("Provision a reviewed FFmpeg build for this platform manually.");
  const destination = resolve(process.argv[2] ?? ".video-tools");
  await mkdir(destination, { recursive: true });
  const temporary = await mkdtemp(join(tmpdir(), "looply-video-tools-"));
  const archive = join(temporary, platform.asset);
  try {
    const response = await fetch(
      `https://github.com/FFmpeg-Builds/FFmpeg-Builds/releases/download/${release}/${platform.asset}`,
      { signal: AbortSignal.timeout(300000) },
    );
    if (!response.ok || !response.body) {
      throw new Error(
        `Video tools download failed (HTTP ${response.status}): ${release}/${platform.asset}`,
      );
    }
    await pipeline(Readable.fromWeb(response.body), createWriteStream(archive, { flags: "wx" }));
    const hash = createHash("sha256")
      .update(await readFile(archive))
      .digest("hex");
    if (hash !== platform.sha256)
      throw new Error("Video tools checksum mismatch; refusing extraction");
    execFileSync("tar", ["-xf", archive, "-C", destination], { shell: false, windowsHide: true });
    const name = platform.asset.replace(/\.(zip|tar\.xz)$/, "");
    const suffix = process.platform === "win32" ? ".exe" : "";
    const variables = {
      MEDIA_FFMPEG_PATH: join(destination, name, "bin", `ffmpeg${suffix}`),
      MEDIA_FFPROBE_PATH: join(destination, name, "bin", `ffprobe${suffix}`),
      MEDIA_VIDEO_BINARY_VERSION: version,
    };
    for (const binary of [variables.MEDIA_FFMPEG_PATH, variables.MEDIA_FFPROBE_PATH]) {
      const output = execFileSync(binary, ["-version"], {
        encoding: "utf8",
        shell: false,
        windowsHide: true,
        timeout: 5000,
        maxBuffer: 128 * 1024,
      });
      if (!output.split("\n")[0].includes(`version ${version}`))
        throw new Error("Video tools version mismatch");
    }
    const content =
      Object.entries(variables)
        .map(([key, value]) => `${key}=${value}`)
        .join("\n") + "\n";
    await writeFile(join(destination, "video.env"), content);
    if (process.env.GITHUB_ENV) await writeFile(process.env.GITHUB_ENV, content, { flag: "a" });
    console.log(
      `Verified FFmpeg/FFprobe ${version}; configuration: ${join(destination, "video.env")}`,
    );
  } finally {
    if (!resolve(temporary).startsWith(resolve(tmpdir(), "looply-video-tools-")))
      throw new Error("Unsafe temporary directory");
    await rm(temporary, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
