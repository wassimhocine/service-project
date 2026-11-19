import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../../app.js";
import { prisma } from "../../infrastructure/prisma.js";

describe("Services Module", () => {
  const ownerEmail = "owner@svc.test";
  const managerEmail = "manager@svc.test";
  const staffEmail = "staff@svc.test";
  const outsiderEmail = "outsider@svc.test";
  const password = "Password123!";

  let owner: { token: string; userId: string };
  let manager: { token: string; userId: string };
  let staff: { token: string; userId: string };
  let outsider: { token: string; userId: string };
  let businessId: string;
  let secondBusinessId: string;

  const cleanDatabase = async () => {
    const testUsers = await prisma.user.findMany({
      where: {
        email: { in: [ownerEmail, managerEmail, staffEmail, outsiderEmail] },
      },
      select: { id: true },
    });
    const userIds = testUsers.map((user) => user.id);

    const testBusinesses = await prisma.business.findMany({
      where: { email: { contains: "svc.test" } },
      select: { id: true },
    });
    const businessIds = testBusinesses.map((business) => business.id);

    if (businessIds.length > 0) {
      await prisma.appointment.deleteMany({
        where: { businessId: { in: businessIds } },
      });
      await prisma.staffService.deleteMany({
        where: { staff: { businessId: { in: businessIds } } },
      });
      await prisma.staffWorkingHours.deleteMany({
        where: { staff: { businessId: { in: businessIds } } },
      });
      await prisma.scheduleException.deleteMany({
        where: { businessId: { in: businessIds } },
      });
      await prisma.customer.deleteMany({
        where: { businessId: { in: businessIds } },
      });
      await prisma.service.deleteMany({
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
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
  };

  const registerUser = async (email: string, firstName: string) => {
    const response = await request(app).post("/api/v1/auth/register").send({
      email,
      password,
      firstName,
      lastName: "SvcTest",
      phone: "+15550001111",
    });

    return {
      token: response.body.token as string,
      userId: response.body.user.id as string,
    };
  };

  const createBusiness = async (token: string, name: string, slug: string) => {
    const response = await request(app)
      .post("/api/v1/businesses")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name,
        slug,
        email: `${slug}@svc.test`,
        phone: "+1234567890",
        timezone: "UTC",
      });

    return response.body.id as string;
  };

  const createService = (token: string, body: Record<string, unknown>) =>
    request(app)
      .post(`/api/v1/businesses/${businessId}/services`)
      .set("Authorization", `Bearer ${token}`)
      .send(body);

  beforeAll(async () => {
    await cleanDatabase();
  });

  beforeEach(async () => {
    await cleanDatabase();

    owner = await registerUser(ownerEmail, "Owner");
    manager = await registerUser(managerEmail, "Manager");
    staff = await registerUser(staffEmail, "Staff");
    outsider = await registerUser(outsiderEmail, "Outsider");

    businessId = await createBusiness(owner.token, "Svc Salon", "svc-salon");
    secondBusinessId = await createBusiness(owner.token, "Svc Salon Two", "svc-salon-two");

    await prisma.businessMembership.create({
      data: {
        userId: manager.userId,
        businessId,
        role: "MANAGER",
        status: "ACTIVE",
      },
    });

    await prisma.businessMembership.create({
      data: {
        userId: staff.userId,
        businessId,
        role: "STAFF",
        status: "ACTIVE",
      },
    });
  });

  afterAll(async () => {
    await cleanDatabase();
  });

  describe("POST /api/v1/businesses/:id/services", () => {
    it("returns 401 when unauthenticated", async () => {
      const response = await request(app)
        .post(`/api/v1/businesses/${businessId}/services`)
        .send({ name: "Haircut", durationMinutes: 30, price: 30 });

      expect(response.status).toBe(401);
    });

    it("returns 400 when required fields are missing", async () => {
      const response = await createService(owner.token, { price: 30 });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("returns 400 when the price is not a positive amount", async () => {
      const zero = await createService(owner.token, {
        name: "Haircut",
        durationMinutes: 30,
        price: "0",
      });
      expect(zero.status).toBe(400);

      const negative = await createService(owner.token, {
        name: "Haircut",
        durationMinutes: 30,
        price: -5,
      });
      expect(negative.status).toBe(400);
    });

    it("returns 400 when the duration is not a whole minute value", async () => {
      const response = await createService(owner.token, {
        name: "Haircut",
        durationMinutes: 0,
        price: 30,
      });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("lets an owner create a service", async () => {
      const response = await createService(owner.token, {
        name: "Haircut",
        description: "Wash, cut and style",
        durationMinutes: 45,
        price: "45.50",
      });

      expect(response.status).toBe(201);
      expect(response.body.name).toBe("Haircut");
      expect(response.body.durationMinutes).toBe(45);
      expect(Number(response.body.price)).toBe(45.5);
      expect(response.body.status).toBe("ACTIVE");
      expect(response.body.businessId).toBe(businessId);
    });

    it("lets a manager create a service", async () => {
      const response = await createService(manager.token, {
        name: "Beard Trim",
        durationMinutes: 15,
        price: 12,
      });

      expect(response.status).toBe(201);
    });

    it("returns 403 when a staff member creates a service", async () => {
      const response = await createService(staff.token, {
        name: "Haircut",
        durationMinutes: 30,
        price: 30,
      });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("FORBIDDEN");
    });

    it("returns 403 when a non-member creates a service", async () => {
      const response = await createService(outsider.token, {
        name: "Haircut",
        durationMinutes: 30,
        price: 30,
      });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("FORBIDDEN");
    });
  });

  describe("GET /api/v1/businesses/:id/services", () => {
    it("lets an active staff member list services", async () => {
      await createService(owner.token, {
        name: "Haircut",
        durationMinutes: 30,
        price: 30,
      });
      await createService(owner.token, {
        name: "Colour",
        durationMinutes: 90,
        price: 120,
      });

      const response = await request(app)
        .get(`/api/v1/businesses/${businessId}/services`)
        .set("Authorization", `Bearer ${staff.token}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.pagination.total).toBe(2);
    });

    it("filters by search text, status and paginates", async () => {
      await createService(owner.token, {
        name: "Haircut",
        description: "Classic cut",
        durationMinutes: 30,
        price: 30,
      });
      await createService(owner.token, {
        name: "Colour",
        durationMinutes: 90,
        price: 120,
      });
      const inactive = await createService(owner.token, {
        name: "Hair Wash",
        durationMinutes: 15,
        price: 10,
      });

      await request(app)
        .delete(`/api/v1/businesses/${businessId}/services/${inactive.body.id}`)
        .set("Authorization", `Bearer ${owner.token}`);

      const search = await request(app)
        .get(`/api/v1/businesses/${businessId}/services?search=cut`)
        .set("Authorization", `Bearer ${owner.token}`);
      expect(search.status).toBe(200);
      expect(search.body.data).toHaveLength(1);
      expect(search.body.data[0].name).toBe("Haircut");

      const active = await request(app)
        .get(`/api/v1/businesses/${businessId}/services?status=ACTIVE`)
        .set("Authorization", `Bearer ${owner.token}`);
      expect(active.body.data).toHaveLength(2);

      const firstPage = await request(app)
        .get(`/api/v1/businesses/${businessId}/services?page=1&limit=2`)
        .set("Authorization", `Bearer ${owner.token}`);
      expect(firstPage.body.data).toHaveLength(2);
      expect(firstPage.body.pagination.totalPages).toBe(2);
    });

    it("returns 400 for an invalid status filter", async () => {
      const response = await request(app)
        .get(`/api/v1/businesses/${businessId}/services?status=BOGUS`)
        .set("Authorization", `Bearer ${owner.token}`);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("GET /api/v1/businesses/:id/services/:serviceId", () => {
    it("returns a service and hides services from other businesses", async () => {
      const created = await createService(owner.token, {
        name: "Haircut",
        durationMinutes: 30,
        price: 30,
      });

      const found = await request(app)
        .get(`/api/v1/businesses/${businessId}/services/${created.body.id}`)
        .set("Authorization", `Bearer ${staff.token}`);
      expect(found.status).toBe(200);
      expect(found.body.id).toBe(created.body.id);

      const foreign = await prisma.service.create({
        data: {
          businessId: secondBusinessId,
          name: "Foreign",
          durationMinutes: 30,
          price: "20.00",
        },
      });

      const hidden = await request(app)
        .get(`/api/v1/businesses/${businessId}/services/${foreign.id}`)
        .set("Authorization", `Bearer ${owner.token}`);
      expect(hidden.status).toBe(404);
      expect(hidden.body.error.code).toBe("NOT_FOUND");
    });
  });

  describe("PATCH /api/v1/businesses/:id/services/:serviceId", () => {
    it("updates fields provided by an owner", async () => {
      const created = await createService(owner.token, {
        name: "Haircut",
        durationMinutes: 30,
        price: 30,
      });

      const response = await request(app)
        .patch(`/api/v1/businesses/${businessId}/services/${created.body.id}`)
        .set("Authorization", `Bearer ${owner.token}`)
        .send({ name: "Deluxe Haircut", durationMinutes: 60, price: "50.00" });

      expect(response.status).toBe(200);
      expect(response.body.name).toBe("Deluxe Haircut");
      expect(response.body.durationMinutes).toBe(60);
      expect(Number(response.body.price)).toBe(50);
    });

    it("returns 400 when no fields are provided", async () => {
      const created = await createService(owner.token, {
        name: "Haircut",
        durationMinutes: 30,
        price: 30,
      });

      const response = await request(app)
        .patch(`/api/v1/businesses/${businessId}/services/${created.body.id}`)
        .set("Authorization", `Bearer ${owner.token}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("returns 403 when a staff member updates a service", async () => {
      const created = await createService(owner.token, {
        name: "Haircut",
        durationMinutes: 30,
        price: 30,
      });

      const response = await request(app)
        .patch(`/api/v1/businesses/${businessId}/services/${created.body.id}`)
        .set("Authorization", `Bearer ${staff.token}`)
        .send({ name: "Changed" });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("FORBIDDEN");
    });

    it("returns 404 when updating a service from another business", async () => {
      const foreign = await prisma.service.create({
        data: {
          businessId: secondBusinessId,
          name: "Foreign",
          durationMinutes: 30,
          price: "20.00",
        },
      });

      const response = await request(app)
        .patch(`/api/v1/businesses/${businessId}/services/${foreign.id}`)
        .set("Authorization", `Bearer ${owner.token}`)
        .send({ name: "Changed" });

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("NOT_FOUND");
    });
  });

  describe("DELETE /api/v1/businesses/:id/services/:serviceId", () => {
    it("soft-deactivates a service and keeps the record", async () => {
      const created = await createService(owner.token, {
        name: "Haircut",
        durationMinutes: 30,
        price: 30,
      });

      const response = await request(app)
        .delete(`/api/v1/businesses/${businessId}/services/${created.body.id}`)
        .set("Authorization", `Bearer ${owner.token}`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe("INACTIVE");

      const stored = await prisma.service.findUnique({
        where: { id: created.body.id },
      });
      expect(stored).not.toBeNull();
      expect(stored?.status).toBe("INACTIVE");

      const repeat = await request(app)
        .delete(`/api/v1/businesses/${businessId}/services/${created.body.id}`)
        .set("Authorization", `Bearer ${owner.token}`);
      expect(repeat.status).toBe(200);
      expect(repeat.body.status).toBe("INACTIVE");
    });

    it("returns 403 when a staff member deactivates a service", async () => {
      const created = await createService(owner.token, {
        name: "Haircut",
        durationMinutes: 30,
        price: 30,
      });

      const response = await request(app)
        .delete(`/api/v1/businesses/${businessId}/services/${created.body.id}`)
        .set("Authorization", `Bearer ${staff.token}`);

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("FORBIDDEN");
    });
  });
});
