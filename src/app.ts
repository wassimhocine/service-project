import cors from "cors";
import express from "express";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";
import { openApiDocument } from "./config/swagger.js";
import { errorHandler, notFoundHandler } from "./middleware/index.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { businessesRouter } from "./modules/businesses/businesses.routes.js";

export const app = express();

// API documentation. Registered before helmet so the default Content Security
// Policy does not block the inline scripts Swagger UI injects.
app.use(
  "/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(openApiDocument, {
    customSiteTitle: "ServiceFlow API",
    swaggerOptions: { persistAuthorization: true },
  })
);
app.get("/api-docs.json", (_request, response) => {
  response.status(200).json(openApiDocument);
});

app.use(helmet());
app.use(cors());
app.use(express.json());

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
