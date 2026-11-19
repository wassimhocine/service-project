import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/index.js";

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    return next(new AppError("Authentication is required", 401, "UNAUTHORIZED"));
  }
  next();
}

export function requireBusinessId(req: Request, _res: Response, next: NextFunction): void {
  const businessId = req.params.businessId;

  if (typeof businessId !== "string" || !businessId) {
    return next(new AppError("Business ID is required", 400, "BAD_REQUEST"));
  }

  req.businessId = businessId;
  next();
}
