import { describe, expect, it } from "vitest";
import { AppError } from "../../src/errors/index.js";

describe("Application Error", () => {
  it("creates AppError with default values", () => {
    const error = new AppError("Base error");
    expect(error.message).toBe("Base error");
    expect(error.statusCode).toBe(500);
    expect(error.code).toBe("INTERNAL_SERVER_ERROR");
    expect(error.isOperational).toBe(false);
    expect(error.details).toBeUndefined();
    expect(error.name).toBe("AppError");
  });

  it("creates client/operational AppError with custom status code, code and details", () => {
    const details = [{ field: "email", message: "Invalid email" }];
    const error = new AppError("Validation failed", 400, "VALIDATION_ERROR", details);

    expect(error.statusCode).toBe(400);
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.message).toBe("Validation failed");
    expect(error.details).toEqual(details);
    expect(error.isOperational).toBe(true);
  });

  it("marks 4xx errors as operational and 5xx as non-operational", () => {
    const notFound = new AppError("Not found", 404, "NOT_FOUND");
    expect(notFound.isOperational).toBe(true);

    const forbidden = new AppError("Forbidden", 403, "FORBIDDEN");
    expect(forbidden.isOperational).toBe(true);

    const conflict = new AppError("Conflict", 409, "CONFLICT");
    expect(conflict.isOperational).toBe(true);

    const serverErr = new AppError("Server failure", 500, "INTERNAL_SERVER_ERROR");
    expect(serverErr.isOperational).toBe(false);
  });
});
