import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { requireAuth, requireBusinessId } from "../../src/middleware/authorize.js";
import { errorHandler } from "../../src/middleware/error-handler.js";

function makeApp(withUser: boolean, ...handlers: express.RequestHandler[]) {
  const app = express();
  if (withUser) {
    app.use((req, _res, next) => {
      req.user = { id: "u1", email: "a@b.com" };
      next();
    });
  }
  app.get("/businesses/:businessId/items", ...handlers, (req, res) =>
    res.json({ businessId: req.businessId })
  );
  app.use(errorHandler);
  return app;
}

describe("requireAuth", () => {
  it("passes when req.user is set", async () => {
    const res = await request(makeApp(true, requireAuth)).get("/businesses/biz-1/items");
    expect(res.status).toBe(200);
  });

  it("returns 401 when req.user is not set", async () => {
    const res = await request(makeApp(false, requireAuth)).get("/businesses/biz-1/items");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });
});

describe("requireBusinessId", () => {
  it("sets req.businessId from :businessId param", async () => {
    const res = await request(makeApp(true, requireBusinessId)).get("/businesses/biz-123/items");
    expect(res.status).toBe(200);
    expect(res.body.businessId).toBe("biz-123");
  });

  it("returns 400 when :businessId param is missing", async () => {
    const app = express();
    app.get("/items", requireBusinessId, (_req, res) => res.json({ ok: true }));
    app.use(errorHandler);
    const res = await request(app).get("/items");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("BAD_REQUEST");
  });
});
