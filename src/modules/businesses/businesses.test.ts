import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../../app.js";
import { prisma } from "../../infrastructure/prisma.js";

describe("Businesses Module", () => {
  const ownerEmail = "owner.biz.test@example.com";
  const managerEmail = "manager.biz.test@example.com";
  const staffEmail = "staff.biz.test@example.com";
  const outsiderEmail = "outsider.biz.test@example.com";
  const password = "Password123!";

  let ownerToken: string;
  let managerToken: string;
  let staffToken: string;
  let outsiderToken: string;

  const cleanDatabase = async () => {
    // Delete test memberships and businesses
    const testUsers = await prisma.user.findMany({
      where: {
        email: { in: [ownerEmail, managerEmail, staffEmail, outsiderEmail] },
      },
      select: { id: true },
    });
    const userIds = testUsers.map((u) => u.id);

    if (userIds.length > 0) {
      await prisma.businessMembership.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.business.deleteMany({
        where: { email: { contains: "biz.test" } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: userIds } },
      });
    }
  };

  const registerUser = async (email: string, firstName: string, lastName: string) => {
    const res = await request(app).post("/api/v1/auth/register").send({
      email,
      password,
      firstName,
      lastName,
    });
    return res.body.token;
  };

  beforeAll(async () => {
    await cleanDatabase();
  });

  beforeEach(async () => {
    await cleanDatabase();
    ownerToken = await registerUser(ownerEmail, "Owner", "User");
    managerToken = await registerUser(managerEmail, "Manager", "User");
    staffToken = await registerUser(staffEmail, "Staff", "User");
    outsiderToken = await registerUser(outsiderEmail, "Outsider", "User");
  });

  afterAll(async () => {
    await cleanDatabase();
  });

  describe("POST /api/v1/businesses", () => {
    it("returns 401 when unauthenticated", async () => {
      const response = await request(app).post("/api/v1/businesses").send({
        name: "Barber Pro",
        email: "contact@biz.test",
        phone: "+123456789",
      });
      expect(response.status).toBe(401);
    });

    it("returns 400 when required fields are missing", async () => {
      const response = await request(app)
        .post("/api/v1/businesses")
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          // missing name, email, phone
          description: "A beauty salon",
        });
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("creates business and assigns creator as OWNER in a transaction", async () => {
      const response = await request(app)
        .post("/api/v1/businesses")
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          name: "Barber King",
          slug: "barber-king",
          description: "Top barbershop in town",
          email: "contact@biz.test",
          phone: "+1234567890",
          address: "123 Main St",
          timezone: "America/New_York",
          currency: "USD",
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty("id");
      expect(response.body.name).toBe("Barber King");
      expect(response.body.slug).toBe("barber-king");
      expect(response.body.status).toBe("ACTIVE");
      expect(response.body.myRole).toBe("OWNER");

      // Verify BusinessMembership was created in DB with OWNER role and ACTIVE status
      const membership = await prisma.businessMembership.findFirst({
        where: { businessId: response.body.id },
      });
      expect(membership).toBeDefined();
      expect(membership?.role).toBe("OWNER");
      expect(membership?.status).toBe("ACTIVE");
    });

    it("returns 409 CONFLICT if slug already exists", async () => {
      await request(app)
        .post("/api/v1/businesses")
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          name: "Barber King",
          slug: "barber-king",
          email: "contact@biz.test",
          phone: "+1234567890",
        });

      const duplicate = await request(app)
        .post("/api/v1/businesses")
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          name: "Another Barber King",
          slug: "barber-king",
          email: "contact2@biz.test",
          phone: "+1987654321",
        });

      expect(duplicate.status).toBe(409);
      expect(duplicate.body.error.code).toBe("CONFLICT");
    });
  });

  describe("GET /api/v1/businesses/:id", () => {
    let businessId: string;

    beforeEach(async () => {
      const res = await request(app)
        .post("/api/v1/businesses")
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          name: "Test Spa",
          slug: "test-spa",
          email: "spa@biz.test",
          phone: "+111222333",
        });
      businessId = res.body.id;
    });

    it("returns business details when requester is an active member", async () => {
      const response = await request(app)
        .get(`/api/v1/businesses/${businessId}`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(businessId);
      expect(response.body.name).toBe("Test Spa");
      expect(response.body.myRole).toBe("OWNER");
    });

    it("returns 403 FORBIDDEN when user has no membership in this business", async () => {
      const response = await request(app)
        .get(`/api/v1/businesses/${businessId}`)
        .set("Authorization", `Bearer ${outsiderToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("FORBIDDEN");
    });

    it("returns 404 when business does not exist", async () => {
      const fakeUuid = "123e4567-e89b-12d3-a456-426614174000";
      const response = await request(app)
        .get(`/api/v1/businesses/${fakeUuid}`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("NOT_FOUND");
    });
  });

  describe("PATCH /api/v1/businesses/:id", () => {
    let businessId: string;

    beforeEach(async () => {
      const res = await request(app)
        .post("/api/v1/businesses")
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          name: "Original Name",
          slug: "original-name",
          email: "original@biz.test",
          phone: "+111222333",
        });
      businessId = res.body.id;
    });

    it("updates business successfully when caller is OWNER", async () => {
      const response = await request(app)
        .patch(`/api/v1/businesses/${businessId}`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          name: "Updated Name",
          description: "New updated description",
        });

      expect(response.status).toBe(200);
      expect(response.body.name).toBe("Updated Name");
      expect(response.body.description).toBe("New updated description");
    });

    it("returns 403 when non-owner tries to update business", async () => {
      const response = await request(app)
        .patch(`/api/v1/businesses/${businessId}`)
        .set("Authorization", `Bearer ${outsiderToken}`)
        .send({
          name: "Hacked Name",
        });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("FORBIDDEN");
    });
  });

  describe("Memberships: GET & POST & PATCH /api/v1/businesses/:id/members", () => {
    let businessId: string;

    beforeEach(async () => {
      const res = await request(app)
        .post("/api/v1/businesses")
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          name: "Team Biz",
          slug: "team-biz",
          email: "team@biz.test",
          phone: "+111222333",
        });
      businessId = res.body.id;
    });

    it("lists members for authorized business member", async () => {
      const response = await request(app)
        .get(`/api/v1/businesses/${businessId}/members`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toBeInstanceOf(Array);
      expect(response.body.length).toBe(1);
      expect(response.body[0].role).toBe("OWNER");
      expect(response.body[0].user.email).toBe(ownerEmail);
    });

    it("adds a new member with specified role and status", async () => {
      const response = await request(app)
        .post(`/api/v1/businesses/${businessId}/members`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          email: managerEmail,
          role: "MANAGER",
          status: "ACTIVE",
        });

      expect(response.status).toBe(201);
      expect(response.body.role).toBe("MANAGER");
      expect(response.body.status).toBe("ACTIVE");
      expect(response.body.user.email).toBe(managerEmail);

      // Verify in member list
      const listRes = await request(app)
        .get(`/api/v1/businesses/${businessId}/members`)
        .set("Authorization", `Bearer ${ownerToken}`);
      expect(listRes.body.length).toBe(2);
    });

    it("returns 404 when trying to add an un-registered email", async () => {
      const response = await request(app)
        .post(`/api/v1/businesses/${businessId}/members`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          email: "nonexistent@nowhere.test",
          role: "STAFF",
        });

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("NOT_FOUND");
    });

    it("returns 409 if user is already a member", async () => {
      await request(app)
        .post(`/api/v1/businesses/${businessId}/members`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          email: staffEmail,
          role: "STAFF",
        });

      const duplicate = await request(app)
        .post(`/api/v1/businesses/${businessId}/members`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          email: staffEmail,
          role: "STAFF",
        });

      expect(duplicate.status).toBe(409);
      expect(duplicate.body.error.code).toBe("CONFLICT");
    });

    it("allows owner to update a member role or status", async () => {
      const addRes = await request(app)
        .post(`/api/v1/businesses/${businessId}/members`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          email: staffEmail,
          role: "STAFF",
          status: "INVITED",
        });

      const memberId = addRes.body.id;

      const updateRes = await request(app)
        .patch(`/api/v1/businesses/${businessId}/members/${memberId}`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          role: "MANAGER",
          status: "ACTIVE",
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.role).toBe("MANAGER");
      expect(updateRes.body.status).toBe("ACTIVE");
    });

    it("prevents demoting or suspending the only active owner", async () => {
      const membersRes = await request(app)
        .get(`/api/v1/businesses/${businessId}/members`)
        .set("Authorization", `Bearer ${ownerToken}`);

      const ownerMemberId = membersRes.body[0].id;

      const demoteRes = await request(app)
        .patch(`/api/v1/businesses/${businessId}/members/${ownerMemberId}`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          role: "STAFF",
        });

      expect(demoteRes.status).toBe(400);
      expect(demoteRes.body.error.code).toBe("BAD_REQUEST");
      expect(demoteRes.body.error.message).toContain("last active owner");
    });
  });
});
