import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config/index.js";
import { AppError } from "../errors/index.js";

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return next(new AppError("Authentication token is required", 401, "UNAUTHORIZED"));
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, config.jwt.secret);

    if (typeof payload !== "object" || !("userId" in payload) || !("email" in payload)) {
      return next(new AppError("Invalid token payload", 401, "UNAUTHORIZED"));
    }

    req.user = {
      id: payload.userId as string,
      email: payload.email as string,
    };

    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return next(new AppError("Token has expired", 401, "UNAUTHORIZED"));
    }
    return next(new AppError("Invalid token", 401, "UNAUTHORIZED"));
  }
}

export function optionalAuthenticate(req: Request, res: Response, next: NextFunction): void {
  if (!req.headers.authorization) {
    return next();
  }
  authenticate(req, res, next);
}
