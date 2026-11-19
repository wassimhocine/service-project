import type { NextFunction, Request, Response } from "express";
import { type ZodType, ZodError } from "zod";
import { AppError, type ValidationErrorDetail } from "../errors/index.js";

export interface RequestSchemas {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

export function formatZodIssues(error: ZodError): ValidationErrorDetail[] {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}

export function validate(schemas: RequestSchemas) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const issues: ValidationErrorDetail[] = [];

    if (schemas.body) {
      const result = schemas.body.safeParse(req.body);
      if (!result.success) {
        issues.push(...formatZodIssues(result.error));
      } else {
        req.body = result.data;
      }
    }

    if (schemas.query) {
      const result = schemas.query.safeParse(req.query);
      if (!result.success) {
        issues.push(...formatZodIssues(result.error));
      } else {
        Object.defineProperty(req, "query", {
          value: result.data,
          writable: true,
          configurable: true,
          enumerable: true,
        });
      }
    }

    if (schemas.params) {
      const result = schemas.params.safeParse(req.params);
      if (!result.success) {
        issues.push(...formatZodIssues(result.error));
      } else {
        req.params = result.data as Record<string, string>;
      }
    }

    if (issues.length > 0) {
      return next(new AppError("Validation failed", 400, "VALIDATION_ERROR", issues));
    }

    next();
  };
}

export const validateBody = (schema: ZodType) => validate({ body: schema });
export const validateQuery = (schema: ZodType) => validate({ query: schema });
export const validateParams = (schema: ZodType) => validate({ params: schema });
