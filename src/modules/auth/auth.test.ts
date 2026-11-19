import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../../app.js";
import { prisma } from "../../infrastructure/prisma.js";

describe("Auth Module - Register & Login", () => {
  const testEmail = "auth.test.user@example.com";
  const testPassword = "Password123!";

  const cleanDatabase = async () => {
    await prisma.user.deleteMany({
      where: {
        email: {
          in: [testEmail, "another.auth.test@example.com", "suspended.user@example.com"],
        },
      },
    });
  };

  beforeAll(async () => {
    await cleanDatabase();
  });

  beforeEach(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await cleanDatabase();
  });

  describe("POST /api/v1/auth/register", () => {
    it("successfully registers a user with valid data", async () => {
      const response = await request(app)
        .post("/api/v1/auth/register")
        .send({
          email: testEmail,
          password: testPassword,
          firstName: "John",
          lastName: "Doe",
          phone: "+1234567890",
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty("token");
      expect(typeof response.body.token).toBe("string");
      expect(response.body).toHaveProperty("user");
      expect(response.body.user).toMatchObject({
        email: testEmail,
        firstName: "John",
        lastName: "Doe",
        phone: "+1234567890",
        status: "ACTIVE",
      });
      expect(response.body.user).not.toHaveProperty("passwordHash");
      expect(response.body.user).not.toHaveProperty("password");
    });

    it("returns 400 VALIDATION_ERROR when required fields are missing", async () => {
      const response = await request(app)
        .post("/api/v1/auth/register")
        .send({
          email: testEmail,
          // missing password, firstName, lastName
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
      expect(response.body.error.details).toBeInstanceOf(Array);
    });

    it("returns 400 VALIDATION_ERROR when password is too short", async () => {
      const response = await request(app)
        .post("/api/v1/auth/register")
        .send({
          email: testEmail,
          password: "short",
          firstName: "John",
          lastName: "Doe",
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
      expect(response.body.error.details.some((d: any) => d.path === "password")).toBe(true);
    });

    it("returns 400 VALIDATION_ERROR when email format is invalid", async () => {
      const response = await request(app)
        .post("/api/v1/auth/register")
        .send({
          email: "invalid-email",
          password: testPassword,
          firstName: "John",
          lastName: "Doe",
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
      expect(response.body.error.details.some((d: any) => d.path === "email")).toBe(true);
    });

    it("returns 409 CONFLICT when email is already registered", async () => {
      await request(app)
        .post("/api/v1/auth/register")
        .send({
          email: testEmail,
          password: testPassword,
          firstName: "John",
          lastName: "Doe",
        });

      const duplicateResponse = await request(app)
        .post("/api/v1/auth/register")
        .send({
          email: testEmail,
          password: testPassword,
          firstName: "Jane",
          lastName: "Smith",
        });

      expect(duplicateResponse.status).toBe(409);
      expect(duplicateResponse.body.error.code).toBe("CONFLICT");
      expect(duplicateResponse.body.error.message).toContain("already registered");
    });
  });

  describe("POST /api/v1/auth/login", () => {
    beforeEach(async () => {
      await request(app)
        .post("/api/v1/auth/register")
        .send({
          email: testEmail,
          password: testPassword,
          firstName: "John",
          lastName: "Doe",
        });
    });

    it("successfully logs in with correct credentials", async () => {
      const response = await request(app)
        .post("/api/v1/auth/login")
        .send({
          email: testEmail,
          password: testPassword,
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("token");
      expect(typeof response.body.token).toBe("string");
      expect(response.body.user).toMatchObject({
        email: testEmail,
        firstName: "John",
        lastName: "Doe",
        status: "ACTIVE",
      });
      expect(response.body.user).not.toHaveProperty("passwordHash");
    });

    it("returns 401 UNAUTHORIZED when password is wrong", async () => {
      const response = await request(app)
        .post("/api/v1/auth/login")
        .send({
          email: testEmail,
          password: "WrongPassword123!",
        });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("UNAUTHORIZED");
      expect(response.body.error.message).toContain("Invalid email or password");
    });

    it("returns 401 UNAUTHORIZED when user does not exist", async () => {
      const response = await request(app)
        .post("/api/v1/auth/login")
        .send({
          email: "nonexistent.user@example.com",
          password: testPassword,
        });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("UNAUTHORIZED");
      expect(response.body.error.message).toContain("Invalid email or password");
    });

    it("returns 400 VALIDATION_ERROR when input format is invalid", async () => {
      const response = await request(app)
        .post("/api/v1/auth/login")
        .send({
          email: "not-an-email",
          password: "",
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("returns 403 FORBIDDEN when user account is SUSPENDED", async () => {
      // Manually set status to SUSPENDED in DB
      await prisma.user.update({
        where: { email: testEmail },
        data: { status: "SUSPENDED" },
      });

      const response = await request(app)
        .post("/api/v1/auth/login")
        .send({
          email: testEmail,
          password: testPassword,
        });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("FORBIDDEN");
      expect(response.body.error.message).toContain("suspended");
    });
  });

  describe("GET & PATCH /api/v1/auth/me and POST /api/v1/auth/logout", () => {
    let token: string;

    beforeEach(async () => {
      const reg = await request(app).post("/api/v1/auth/register").send({
        email: testEmail,
        password: testPassword,
        firstName: "John",
        lastName: "Doe",
      });
      token = reg.body.token;
    });

    it("returns the current authenticated user from GET /me", async () => {
      const response = await request(app)
        .get("/api/v1/auth/me")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        email: testEmail,
        firstName: "John",
        lastName: "Doe",
        phone: null,
        status: "ACTIVE",
      });
      expect(response.body).not.toHaveProperty("passwordHash");
    });

    it("returns 401 when GET /me is called without authentication", async () => {
      const response = await request(app).get("/api/v1/auth/me");
      expect(response.status).toBe(401);
    });

    it("updates user profile including phone via PATCH /me", async () => {
      const response = await request(app)
        .patch("/api/v1/auth/me")
        .set("Authorization", `Bearer ${token}`)
        .send({ firstName: "Jonathan", phone: "+15551234567" });

      expect(response.status).toBe(200);
      expect(response.body.firstName).toBe("Jonathan");
      expect(response.body.phone).toBe("+15551234567");
      expect(response.body.lastName).toBe("Doe");
    });

    it("returns 400 when PATCH /me is sent an empty body", async () => {
      const response = await request(app)
        .patch("/api/v1/auth/me")
        .set("Authorization", `Bearer ${token}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("logs out an authenticated user via POST /logout", async () => {
      const unauth = await request(app).post("/api/v1/auth/logout");
      expect(unauth.status).toBe(401);

      const response = await request(app)
        .post("/api/v1/auth/logout")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("message");
    });
  });
});
