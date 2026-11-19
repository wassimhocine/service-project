import type { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { AppError } from "../errors/index.js";
import { logger } from "../utils/logger.js";
import { config } from "../config/index.js";

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (res.headersSent) return;

  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error({ err, path: req.path, method: req.method }, "Server error");
    }
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details !== undefined && { details: err.details }),
      },
    });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      const fields = Array.isArray(err.meta?.target) ? (err.meta.target as string[]).join(", ") : "field";
      res.status(409).json({ error: { code: "CONFLICT", message: `A record with this ${fields} already exists` } });
      return;
    }
    if (err.code === "P2025") {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Record not found" } });
      return;
    }
  }

  if (err instanceof SyntaxError && "status" in err && err.status === 400) {
    res.status(400).json({ error: { code: "BAD_REQUEST", message: "Malformed JSON" } });
    return;
  }

  logger.error({ err, path: req.path, method: req.method }, "Unhandled error");

  res.status(500).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: config.nodeEnv === "production" ? "Internal server error" : (err instanceof Error ? err.message : "Internal server error"),
    },
  });
}

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new AppError(`${req.method} ${req.originalUrl} not found`, 404, "NOT_FOUND"));
}
