import "dotenv/config";

export const config = {
  port: Number(process.env.PORT ?? 3000),
  nodeEnv: process.env.NODE_ENV ?? "development",
  jwt: {
    secret: process.env.JWT_SECRET ?? "default-development-jwt-secret-do-not-use-in-production",
    expiresIn: process.env.JWT_EXPIRES_IN ?? "1d",
  },
  databaseUrl: process.env.DATABASE_URL,
  logLevel: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "test" ? "silent" : "info"),
};
