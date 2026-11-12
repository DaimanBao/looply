import "dotenv/config";
import { app } from "./app";
import { prisma } from "./shared/database/prisma";

const port = Number(process.env.PORT ?? 3000);

async function main(): Promise<void> {
  await prisma.$connect();

  const server = app.listen(port, () => {
    console.log(`Looply backend running on http://localhost:${port}`);
  });

  let shuttingDown = false;

  async function shutdown(): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;

    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
  }

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch(async (error: unknown) => {
  console.error("Failed to start backend:", error);
  await prisma.$disconnect();
  process.exitCode = 1;
});