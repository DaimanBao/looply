import "dotenv/config";
import app from "./app";
import { prisma } from "./config/prisma";

const PORT = Number(process.env.PORT ?? 3000);

async function startServer(): Promise<void> {
  try {
    await prisma.$connect();

    console.log("PostgreSQL connected successfully");

    const server = app.listen(PORT, () => {
      console.log(`Looply API running at http://localhost:${PORT}`);
    });

    async function shutdown(signal: string): Promise<void> {
      console.log(`${signal} received. Shutting down...`);

      server.close(async () => {
        try {
          await prisma.$disconnect();
          console.log("Database disconnected");
          process.exit(0);
        } catch (error) {
          console.error("Error during shutdown:", error);
          process.exit(1);
        }
      });
    }

    process.once("SIGINT", () => {
      void shutdown("SIGINT");
    });

    process.once("SIGTERM", () => {
      void shutdown("SIGTERM");
    });
  } catch (error) {
    console.error("Failed to start Looply backend:", error);

    await prisma.$disconnect();
    process.exitCode = 1;
  }
}

void startServer();