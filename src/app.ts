import cors from "cors";
import express from "express";
import helmet from "helmet";
import { errorHandler, notFoundHandler } from "./middleware/index.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { businessesRouter } from "./modules/businesses/businesses.routes.js";

export const app = express();

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
