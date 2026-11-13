import "dotenv/config";
import { createBackend } from "./bootstrap";
import { loadConfig } from "./config/environment";
import { loadAuthConfig } from "./config/auth-config";
import { createOtpInspector, inspectorConfig } from "./development/otp-inspector";
import { FakeMessageProvider } from "./modules/auth/providers/message-provider";

/** Khởi động backend đã lắp ghép và giữ tín hiệu tiến trình ngoài ứng dụng HTTP tái sử dụng. */
async function main(): Promise<void> {
  const config = loadConfig();
  const inspector = inspectorConfig(config.environment, process.env);
  const authConfig = loadAuthConfig(process.env, config.environment);
  const backend = createBackend(config, authConfig);
  const { sms, email } = backend.features.providers;
  if (
    inspector &&
    (!(sms instanceof FakeMessageProvider) || !(email instanceof FakeMessageProvider))
  )
    throw new Error("Inspector requires fake providers");
  const tool =
    inspector && sms instanceof FakeMessageProvider && email instanceof FakeMessageProvider
      ? createOtpInspector(config.environment, inspector, {
          store: backend.features.redis,
          sms,
          email,
          pepper: authConfig.AUTH_OTP_PEPPER,
        })
      : undefined;
  let stopping = false;

  /** Cleanup tài nguyên một lần; quá deadline cần thoát tiến trình cưỡng chế cuối cùng. */
  async function shutdown(): Promise<void> {
    if (stopping) return;
    stopping = true;
    try {
      if (tool?.listening) {
        tool.closeAllConnections();
        await new Promise<void>((resolve) => tool.close(() => resolve()));
      }
      await backend.runtime.stop();
      process.exitCode = 0;
    } catch {
      backend.logger.fatal({ code: "SHUTDOWN_FAILED" }, "Backend could not stop safely");
      process.exit(1);
    }
  }

  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());
  await backend.runtime.start();
  if (tool && inspector) {
    try {
      await new Promise<void>((resolve, reject) => {
        tool.once("error", reject);
        tool.listen(inspector.port, "127.0.0.1", resolve);
      });
    } catch {
      await backend.runtime.stop();
      throw new Error("Development inspector startup failed");
    }
  }
}

// Không tuần tự hóa cấu hình, lỗi kết nối hoặc nội dung exception tùy ý khi khởi động.
main().catch(() => {
  console.error("Backend startup failed. Check configuration and database availability.");
  process.exitCode = 1;
});
