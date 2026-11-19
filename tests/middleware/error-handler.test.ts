import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { AppError } from "../../src/errors/index.js";
import { errorHandler, notFoundHandler } from "../../src/middleware/error-handler.js";

function makeApp(...routes: Array<[string, express.RequestHandler]>) {
  const app = express();
  app.use(express.json());
  for (const [path, handler] of routes) {
    app.get(path, handler);
  }
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

describe("errorHandler", () => {
  it("serialises AppError with correct status and shape", async () => {
    const app = makeApp(["/e", () => { throw new AppError("Not found", 404, "NOT_FOUND"); }]);
    const res = await request(app).get("/e");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: "NOT_FOUND", message: "Not found" } });
  });

  it("includes details when AppError carries them", async () => {
    const app = makeApp(["/e", () => {
      throw new AppError("Validation failed", 400, "VALIDATION_ERROR", [{ path: "name", message: "required" }]);
    }]);
    const res = await request(app).get("/e");
    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual([{ path: "name", message: "required" }]);
  });

  it("maps Prisma P2002 to 409 CONFLICT", async () => {
    const app = makeApp(["/e", () => {
      throw new Prisma.PrismaClientKnownRequestError("Unique", {
        code: "P2002", clientVersion: "6.0", meta: { target: ["email"] },
      });
    }]);
    const res = await request(app).get("/e");
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
  });

  it("maps Prisma P2025 to 404 NOT_FOUND", async () => {
    const app = makeApp(["/e", () => {
      throw new Prisma.PrismaClientKnownRequestError("Not found", { code: "P2025", clientVersion: "6.0" });
    }]);
    const res = await request(app).get("/e");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("maps malformed JSON to 400 BAD_REQUEST", async () => {
    const app = express();
    app.use(express.json());
    app.post("/e", (_req, res) => res.json({ ok: true }));
    app.use(errorHandler);
    const res = await request(app)
      .post("/e")
      .set("Content-Type", "application/json")
      .send("{ bad json }");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("BAD_REQUEST");
  });

  it("returns 500 for unknown errors", async () => {
    const app = makeApp(["/e", () => { throw new Error("boom"); }]);
    const res = await request(app).get("/e");
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("INTERNAL_SERVER_ERROR");
  });

  it("notFoundHandler returns 404 for unknown routes", async () => {
    const res = await request(makeApp()).get("/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});
