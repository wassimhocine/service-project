import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { validate, validateBody, validateParams, validateQuery } from "../../src/middleware/validate.js";
import { errorHandler } from "../../src/middleware/error-handler.js";

function makeApp(...handlers: express.RequestHandler[]) {
  const app = express();
  app.use(express.json());
  app.post("/test/:id", ...handlers, (req, res) =>
    res.json({ body: req.body, query: req.query, params: req.params })
  );
  app.use(errorHandler);
  return app;
}

describe("validate", () => {
  it("parses and replaces body with validated data", async () => {
    const app = makeApp(validateBody(z.object({ name: z.string() })));
    const res = await request(app).post("/test/1").send({ name: "Alice", extra: "dropped" });
    expect(res.status).toBe(200);
    expect(res.body.body).toEqual({ name: "Alice" });
  });

  it("returns 400 on invalid body", async () => {
    const app = makeApp(validateBody(z.object({ age: z.number() })));
    const res = await request(app).post("/test/1").send({ age: "not-a-number" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.details[0].path).toBe("age");
  });

  it("validates query params", async () => {
    const app = makeApp(validateQuery(z.object({ page: z.string() })));
    const res = await request(app).post("/test/1?page=2");
    expect(res.status).toBe(200);
    expect(res.body.query.page).toBe("2");
  });

  it("validates route params", async () => {
    const app = makeApp(validateParams(z.object({ id: z.string().uuid() })));
    const valid = await request(app).post("/test/123e4567-e89b-12d3-a456-426614174000");
    expect(valid.status).toBe(200);

    const invalid = await request(app).post("/test/not-a-uuid");
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.details[0].path).toBe("id");
  });

  it("collects errors from multiple schemas", async () => {
    const app = makeApp(
      validate({
        body: z.object({ name: z.string() }),
        query: z.object({ page: z.number() }),
      })
    );
    const res = await request(app).post("/test/1?page=abc").send({ name: 123 });
    expect(res.status).toBe(400);
    expect(res.body.error.details.length).toBeGreaterThanOrEqual(2);
  });
});
