import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../../app.js";
import { prisma } from "../../infrastructure/prisma.js";

describe("Customers Module", () => {
  const ownerEmail = "owner.cust.test@example.com";
  const outsiderEmail = "outsider.cust.test@example.com";
  const password = "Password123!";

  let ownerToken: string;
  let outsiderToken: string;
  let businessId: string;
  let secondBusinessId: string;

  const cleanDatabase = async () => {
    const testUsers = await prisma.user.findMany({
      where: {
        email: { in: [ownerEmail, outsiderEmail, "linked.user@example.com"] },
      },
      select: { id: true },
    });
    const userIds = testUsers.map((u) => u.id);

    const testBusinesses = await prisma.business.findMany({
      where: { email: { contains: "cust.test" } },
      select: { id: true },
    });
    const businessIds = testBusinesses.map((b) => b.id);

    if (businessIds.length > 0) {
      await prisma.customer.deleteMany({
        where: { businessId: { in: businessIds } },
      });
      await prisma.businessMembership.deleteMany({
        where: { businessId: { in: businessIds } },
      });
      await prisma.business.deleteMany({
        where: { id: { in: businessIds } },
      });
    }

    if (userIds.length > 0) {
      await prisma.businessMembership.deleteMany({
        where: { userId: { in: userIds } },
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

  const createBusiness = async (token: string, name: string, slug: string) => {
    const res = await request(app)
      .post("/api/v1/businesses")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name,
        slug,
        email: `${slug}@cust.test`,
        phone: "+1234567890",
      });
    return res.body.id;
  };

  beforeAll(async () => {
    await cleanDatabase();
  });

  beforeEach(async () => {
    await cleanDatabase();
    ownerToken = await registerUser(ownerEmail, "Owner", "CustTest");
    outsiderToken = await registerUser(outsiderEmail, "Outsider", "CustTest");

    businessId = await createBusiness(ownerToken, "Salon One", "salon-one");
    secondBusinessId = await createBusiness(ownerToken, "Salon Two", "salon-two");
  });

  afterAll(async () => {
    await cleanDatabase();
  });

  describe("POST /api/v1/businesses/:id/customers", () => {
    it("returns 401 when unauthenticated", async () => {
      const response = await request(app)
        .post(`/api/v1/businesses/${businessId}/customers`)
        .send({
          firstName: "Alice",
          lastName: "Brown",
          email: "alice@client.test",
          phone: "+1987654321",
        });

      expect(response.status).toBe(401);
    });

    it("returns 403 when user is not a member of this business", async () => {
      const response = await request(app)
        .post(`/api/v1/businesses/${businessId}/customers`)
        .set("Authorization", `Bearer ${outsiderToken}`)
        .send({
          firstName: "Alice",
          lastName: "Brown",
          email: "alice@client.test",
          phone: "+1987654321",
        });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("FORBIDDEN");
    });

    it("returns 400 when required fields are missing", async () => {
      const response = await request(app)
        .post(`/api/v1/businesses/${businessId}/customers`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          firstName: "Alice",
          // missing lastName, email, phone
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("creates a customer successfully and returns 201", async () => {
      const response = await request(app)
        .post(`/api/v1/businesses/${businessId}/customers`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          firstName: "Alice",
          lastName: "Brown",
          email: "alice@client.test",
          phone: "+1987654321",
          notes: "Prefers evening appointments",
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty("id");
      expect(response.body.businessId).toBe(businessId);
      expect(response.body.firstName).toBe("Alice");
      expect(response.body.lastName).toBe("Brown");
      expect(response.body.email).toBe("alice@client.test");
      expect(response.body.phone).toBe("+1987654321");
      expect(response.body.notes).toBe("Prefers evening appointments");
    });

    it("automatically links to registered User account if email matches", async () => {
      await registerUser("linked.user@example.com", "Linked", "Account");

      const response = await request(app)
        .post(`/api/v1/businesses/${businessId}/customers`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          firstName: "Linked",
          lastName: "Account",
          email: "linked.user@example.com",
          phone: "+1555555555",
        });

      expect(response.status).toBe(201);
      expect(response.body.userId).toBeDefined();
      expect(typeof response.body.userId).toBe("string");
    });

    it("returns 409 CONFLICT if a customer with the same email already exists in this business", async () => {
      await request(app)
        .post(`/api/v1/businesses/${businessId}/customers`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          firstName: "Alice",
          lastName: "Brown",
          email: "alice@client.test",
          phone: "+1987654321",
        });

      const duplicate = await request(app)
        .post(`/api/v1/businesses/${businessId}/customers`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          firstName: "Alice",
          lastName: "Smith",
          email: "alice@client.test",
          phone: "+1222222222",
        });

      expect(duplicate.status).toBe(409);
      expect(duplicate.body.error.code).toBe("CONFLICT");
    });

    it("allows the same customer email in a different business (tenant isolation)", async () => {
      const res1 = await request(app)
        .post(`/api/v1/businesses/${businessId}/customers`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          firstName: "Alice",
          lastName: "Brown",
          email: "alice@client.test",
          phone: "+1987654321",
        });
      expect(res1.status).toBe(201);

      const res2 = await request(app)
        .post(`/api/v1/businesses/${secondBusinessId}/customers`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          firstName: "Alice",
          lastName: "Brown",
          email: "alice@client.test",
          phone: "+1987654321",
        });
      expect(res2.status).toBe(201);
    });
  });

  describe("GET /api/v1/businesses/:id/customers", () => {
    beforeEach(async () => {
      await request(app)
        .post(`/api/v1/businesses/${businessId}/customers`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          firstName: "Alice",
          lastName: "Brown",
          email: "alice@client.test",
          phone: "+1111111111",
        });

      await request(app)
        .post(`/api/v1/businesses/${businessId}/customers`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          firstName: "Bob",
          lastName: "White",
          email: "bob@client.test",
          phone: "+2222222222",
        });
    });

    it("returns list of customers for active member", async () => {
      const response = await request(app)
        .get(`/api/v1/businesses/${businessId}/customers`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("data");
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.data.length).toBe(2);
      expect(response.body).toHaveProperty("pagination");
      expect(response.body.pagination.total).toBe(2);
    });

    it("filters customers by search query", async () => {
      const response = await request(app)
        .get(`/api/v1/businesses/${businessId}/customers?search=bob`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].firstName).toBe("Bob");
    });

    it("returns 403 when user is not a member of the business", async () => {
      const response = await request(app)
        .get(`/api/v1/businesses/${businessId}/customers`)
        .set("Authorization", `Bearer ${outsiderToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("FORBIDDEN");
    });
  });

  describe("GET /api/v1/businesses/:id/customers/:customerId", () => {
    let customerId: string;

    beforeEach(async () => {
      const res = await request(app)
        .post(`/api/v1/businesses/${businessId}/customers`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          firstName: "Charlie",
          lastName: "Green",
          email: "charlie@client.test",
          phone: "+3333333333",
        });
      customerId = res.body.id;
    });

    it("returns customer details successfully", async () => {
      const response = await request(app)
        .get(`/api/v1/businesses/${businessId}/customers/${customerId}`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(customerId);
      expect(response.body.firstName).toBe("Charlie");
    });

    it("returns 404 if customer does not exist", async () => {
      const fakeId = "123e4567-e89b-12d3-a456-426614174000";
      const response = await request(app)
        .get(`/api/v1/businesses/${businessId}/customers/${fakeId}`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("NOT_FOUND");
    });

    it("returns 404 if customer exists but belongs to a different business", async () => {
      const response = await request(app)
        .get(`/api/v1/businesses/${secondBusinessId}/customers/${customerId}`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("NOT_FOUND");
    });
  });

  describe("PATCH /api/v1/businesses/:id/customers/:customerId", () => {
    let customerId: string;

    beforeEach(async () => {
      const res = await request(app)
        .post(`/api/v1/businesses/${businessId}/customers`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          firstName: "David",
          lastName: "Miller",
          email: "david@client.test",
          phone: "+4444444444",
        });
      customerId = res.body.id;
    });

    it("updates customer information successfully", async () => {
      const response = await request(app)
        .patch(`/api/v1/businesses/${businessId}/customers/${customerId}`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          phone: "+4440000000",
          notes: "Updated VIP notes",
        });

      expect(response.status).toBe(200);
      expect(response.body.phone).toBe("+4440000000");
      expect(response.body.notes).toBe("Updated VIP notes");
      expect(response.body.firstName).toBe("David"); // unchanged
    });

    it("returns 409 if updating email to another existing customer's email", async () => {
      // create another customer
      await request(app)
        .post(`/api/v1/businesses/${businessId}/customers`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          firstName: "Emma",
          lastName: "Watson",
          email: "emma@client.test",
          phone: "+5555555555",
        });

      const response = await request(app)
        .patch(`/api/v1/businesses/${businessId}/customers/${customerId}`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          email: "emma@client.test",
        });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("CONFLICT");
    });

    it("allows STAFF to read customers but forbids creating or updating them", async () => {
      await request(app)
        .post(`/api/v1/businesses/${businessId}/members`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          email: outsiderEmail,
          role: "STAFF",
          status: "ACTIVE",
        });

      const listRes = await request(app)
        .get(`/api/v1/businesses/${businessId}/customers`)
        .set("Authorization", `Bearer ${outsiderToken}`);
      expect(listRes.status).toBe(200);

      const createRes = await request(app)
        .post(`/api/v1/businesses/${businessId}/customers`)
        .set("Authorization", `Bearer ${outsiderToken}`)
        .send({
          firstName: "Blocked",
          lastName: "Create",
          email: "blocked@client.test",
          phone: "+1999999999",
        });
      expect(createRes.status).toBe(403);

      const updateRes = await request(app)
        .patch(`/api/v1/businesses/${businessId}/customers/${customerId}`)
        .set("Authorization", `Bearer ${outsiderToken}`)
        .send({ notes: "Not allowed" });
      expect(updateRes.status).toBe(403);
    });
  });
});
