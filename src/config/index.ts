import "dotenv/config";

const nodeEnv = process.env.NODE_ENV ?? "development";

if (nodeEnv === "production") {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET environment variable must be set in production");
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL environment variable must be set in production");
  }
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  nodeEnv,
  jwt: {
    secret: process.env.JWT_SECRET ?? "default-development-jwt-secret-do-not-use-in-production",
    expiresIn: process.env.JWT_EXPIRES_IN ?? "1d",
  },
  databaseUrl: process.env.DATABASE_URL,
  logLevel: process.env.LOG_LEVEL ?? (nodeEnv === "test" ? "silent" : "info"),
};
