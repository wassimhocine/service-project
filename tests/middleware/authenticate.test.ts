import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { config } from "../../src/config/index.js";
import { authenticate, optionalAuthenticate } from "../../src/middleware/authenticate.js";
import { errorHandler } from "../../src/middleware/error-handler.js";

const sign = (payload: object, expiresIn = "1h") =>
  jwt.sign(payload, config.jwt.secret, { expiresIn });

function makeApp(...handlers: express.RequestHandler[]) {
  const app = express();
  app.use(express.json());
  app.get("/test", ...handlers, (req, res) => res.json({ user: req.user }));
  app.use(errorHandler);
  return app;
}

describe("authenticate", () => {
  it("sets req.user from a valid token", async () => {
    const token = sign({ userId: "u1", email: "a@b.com" });
    const res = await request(makeApp(authenticate))
      .get("/test")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user).toEqual({ id: "u1", email: "a@b.com" });
  });

  it("returns 401 when no Authorization header", async () => {
    const res = await request(makeApp(authenticate)).get("/test");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 401 when header is not Bearer format", async () => {
    const res = await request(makeApp(authenticate))
      .get("/test")
      .set("Authorization", "Basic abc");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 401 when token is expired", async () => {
    const token = sign({ userId: "u1", email: "a@b.com" }, "-1s");
    const res = await request(makeApp(authenticate))
      .get("/test")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe("Token has expired");
  });

  it("returns 401 when token is signed with wrong secret", async () => {
    const token = jwt.sign({ userId: "u1", email: "a@b.com" }, "wrong");
    const res = await request(makeApp(authenticate))
      .get("/test")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe("Invalid token");
  });
});

describe("optionalAuthenticate", () => {
  it("continues without setting req.user when no token provided", async () => {
    const res = await request(makeApp(optionalAuthenticate)).get("/test");
    expect(res.status).toBe(200);
    expect(res.body.user).toBeUndefined();
  });

  it("sets req.user when a valid token is provided", async () => {
    const token = sign({ userId: "u2", email: "b@c.com" });
    const res = await request(makeApp(optionalAuthenticate))
      .get("/test")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe("u2");
  });
});
