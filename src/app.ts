import cors from "cors";
import express from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import swaggerUi from "swagger-ui-express";
import { openApiDocument } from "./config/swagger.js";
import { errorHandler, notFoundHandler } from "./middleware/index.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { businessesRouter } from "./modules/businesses/businesses.routes.js";
import { logger } from "./utils/logger.js";

export const app = express();

app.use(pinoHttp({ logger }));
app.use(cors());
app.use(express.json());

// Relax CSP only on Swagger UI so its inline assets render, keeping all other
// Helmet headers intact across the entire application.
app.use(
  "/api-docs",
  helmet({ contentSecurityPolicy: false }),
  swaggerUi.serve,
  swaggerUi.setup(openApiDocument, {
    customSiteTitle: "ServiceFlow API",
    swaggerOptions: { persistAuthorization: true },
  })
);
app.use(helmet());

app.get("/api-docs.json", (_request, response) => {
  response.status(200).json(openApiDocument);
});

app.get("/health", (_request, response) => {
  response.status(200).json({ status: "ok" });
});

// API Routes
app.use("/api/v1/auth", authRouter);
app.use("/auth", authRouter);
app.use("/api/v1/businesses", businessesRouter);
app.use("/businesses", businessesRouter);

// 404 handler for unmatched routes
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);
