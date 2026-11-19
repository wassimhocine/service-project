import "dotenv/config";
import { app } from "./app.js";
import { config } from "./config/index.js";
import { logger } from "./utils/logger.js";
import { prisma } from "./infrastructure/prisma.js";

app.listen(config.port, () => {
  logger.info({ port: config.port }, "Server listening");
});

process.on("SIGTERM", async () => {
  await prisma.$disconnect();
  process.exit(0);
});
