import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../../app.js";
import { prisma } from "../../infrastructure/prisma.js";

describe("Staff Module", () => {
  const ownerEmail = "owner.staff.test@example.com";
  const outsiderEmail = "outsider.staff.test@example.com";
  const staffOneEmail = "staff.one@staff.test";
  const staffTwoEmail = "staff.two@staff.test";
  const password = "Password123!";

  let owner: { token: string; userId: string };
  let outsider: { token: string; userId: string };
  let staffOne: { token: string; userId: string };
  let businessId: string;
  let secondBusinessId: string;

  const cleanDatabase = async () => {
    const testUsers = await prisma.user.findMany({
      where: {
        email: {
          in: [ownerEmail, outsiderEmail, staffOneEmail, staffTwoEmail],
        },
      },
      select: { id: true },
    });
    const userIds = testUsers.map((u) => u.id);

    const testBusinesses = await prisma.business.findMany({
      where: { email: { contains: "staff.test" } },
      select: { id: true },
    });
    const businessIds = testBusinesses.map((b) => b.id);

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
    return { token: res.body.token as string, userId: res.body.user.id as string };
  };

  const createBusiness = async (token: string, name: string, slug: string) => {
    const res = await request(app)
      .post("/api/v1/businesses")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name,
        slug,
        email: `${slug}@staff.test`,
        phone: "+1234567890",
      });
    return res.body.id as string;
  };

  const addStaffTo = async (
    targetBusinessId: string,
    email: string,
    status: "ACTIVE" | "INVITED" = "ACTIVE"
  ) =>
    request(app)
      .post(`/api/v1/businesses/${targetBusinessId}/staff`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ email, status });

  const addStaff = async (email: string, status: "ACTIVE" | "INVITED" = "ACTIVE") =>
    addStaffTo(businessId, email, status);

  const createService = async (name: string, targetBusinessId = businessId) =>
    prisma.service.create({
      data: {
        businessId: targetBusinessId,
        name,
        durationMinutes: 30,
        price: "25.00",
      },
    });

  beforeAll(async () => {
    await cleanDatabase();
  });

  beforeEach(async () => {
    await cleanDatabase();
    owner = await registerUser(ownerEmail, "Owner", "StaffTest");
    outsider = await registerUser(outsiderEmail, "Outsider", "StaffTest");
    staffOne = await registerUser(staffOneEmail, "Sam", "Staff");
    businessId = await createBusiness(owner.token, "Salon One", "staff-salon-one");
    secondBusinessId = await createBusiness(owner.token, "Salon Two", "staff-salon-two");
  });

  afterAll(async () => {
    await cleanDatabase();
  });

  describe("POST /api/v1/businesses/:id/staff", () => {
    it("returns 401 when unauthenticated", async () => {
      const response = await request(app)
        .post(`/api/v1/businesses/${businessId}/staff`)
        .send({ email: staffOneEmail });

      expect(response.status).toBe(401);
    });

    it("returns 403 when user is not a member of this business", async () => {
      const response = await request(app)
        .post(`/api/v1/businesses/${businessId}/staff`)
        .set("Authorization", `Bearer ${outsider.token}`)
        .send({ email: staffOneEmail });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("FORBIDDEN");
    });

    it("returns 403 when an active STAFF member tries to add staff", async () => {
      await addStaff(staffOneEmail);

      const response = await request(app)
        .post(`/api/v1/businesses/${businessId}/staff`)
        .set("Authorization", `Bearer ${staffOne.token}`)
        .send({ email: staffTwoEmail });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("FORBIDDEN");
    });

    it("returns 400 when email is missing", async () => {
      const response = await request(app)
        .post(`/api/v1/businesses/${businessId}/staff`)
        .set("Authorization", `Bearer ${owner.token}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("returns 404 when no user exists with the provided email", async () => {
      const response = await request(app)
        .post(`/api/v1/businesses/${businessId}/staff`)
        .set("Authorization", `Bearer ${owner.token}`)
        .send({ email: "nobody@staff.test" });

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("NOT_FOUND");
    });

    it("creates staff successfully and returns 201", async () => {
      const response = await addStaff(staffOneEmail);

      expect(response.status).toBe(201);
      expect(response.body.id).toBeDefined();
      expect(response.body.businessId).toBe(businessId);
      expect(response.body.role).toBe("STAFF");
      expect(response.body.status).toBe("ACTIVE");
      expect(response.body.user.email).toBe(staffOneEmail);
      expect(response.body.staffServices).toEqual([]);
      expect(response.body.workingHours).toEqual([]);
    });

    it("honors an INVITED status on creation", async () => {
      const response = await addStaff(staffOneEmail, "INVITED");

      expect(response.status).toBe(201);
      expect(response.body.status).toBe("INVITED");
    });

    it("returns 409 if the user is already a member of this business", async () => {
      await addStaff(staffOneEmail);

      const duplicate = await addStaff(staffOneEmail);

      expect(duplicate.status).toBe(409);
      expect(duplicate.body.error.code).toBe("CONFLICT");
    });

    it("allows the same user to be staff in a different business", async () => {
      expect((await addStaff(staffOneEmail)).status).toBe(201);

      const second = await addStaffTo(secondBusinessId, staffOneEmail);

      expect(second.status).toBe(201);
      expect(second.body.businessId).toBe(secondBusinessId);
    });
  });

  describe("GET /api/v1/businesses/:id/staff", () => {
    beforeEach(async () => {
      await addStaff(staffOneEmail);
    });

    it("lists staff members for an active member", async () => {
      const response = await request(app)
        .get(`/api/v1/businesses/${businessId}/staff`)
        .set("Authorization", `Bearer ${owner.token}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].role).toBe("STAFF");
      expect(response.body.data[0].user.email).toBe(staffOneEmail);
      expect(response.body.pagination.total).toBe(1);
    });

    it("does not include owners or managers", async () => {
      const response = await request(app)
        .get(`/api/v1/businesses/${businessId}/staff`)
        .set("Authorization", `Bearer ${owner.token}`);

      expect(response.status).toBe(200);
      expect(response.body.data.map((s: any) => s.user.email)).not.toContain(ownerEmail);
    });

    it("filters staff by search query", async () => {
      await registerUser(staffTwoEmail, "Nina", "Nguyen");
      await addStaff(staffTwoEmail);

      const response = await request(app)
        .get(`/api/v1/businesses/${businessId}/staff?search=nina`)
        .set("Authorization", `Bearer ${owner.token}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].user.email).toBe(staffTwoEmail);
    });

    it("filters staff by status", async () => {
      await registerUser(staffTwoEmail, "Nina", "Nguyen");
      await addStaff(staffTwoEmail, "INVITED");

      const response = await request(app)
        .get(`/api/v1/businesses/${businessId}/staff?status=INVITED`)
        .set("Authorization", `Bearer ${owner.token}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].user.email).toBe(staffTwoEmail);
    });

    it("paginates staff members", async () => {
      await registerUser(staffTwoEmail, "Nina", "Nguyen");
      await addStaff(staffTwoEmail);

      const response = await request(app)
        .get(`/api/v1/businesses/${businessId}/staff?page=1&limit=1`)
        .set("Authorization", `Bearer ${owner.token}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.pagination.total).toBe(2);
      expect(response.body.pagination.totalPages).toBe(2);
    });

    it("allows active staff to view the staff list", async () => {
      const response = await request(app)
        .get(`/api/v1/businesses/${businessId}/staff`)
        .set("Authorization", `Bearer ${staffOne.token}`);

      expect(response.status).toBe(200);
    });

    it("returns 403 when user is not a member of the business", async () => {
      const response = await request(app)
        .get(`/api/v1/businesses/${businessId}/staff`)
        .set("Authorization", `Bearer ${outsider.token}`);

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("FORBIDDEN");
    });
  });

  describe("GET /api/v1/businesses/:id/staff/:staffId", () => {
    let staffId: string;

    beforeEach(async () => {
      const res = await addStaff(staffOneEmail);
      staffId = res.body.id;
    });

    it("returns staff details with services and schedule", async () => {
      const response = await request(app)
        .get(`/api/v1/businesses/${businessId}/staff/${staffId}`)
        .set("Authorization", `Bearer ${owner.token}`);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(staffId);
      expect(response.body.role).toBe("STAFF");
      expect(response.body.user.email).toBe(staffOneEmail);
      expect(response.body.staffServices).toEqual([]);
      expect(response.body.workingHours).toEqual([]);
    });

    it("returns 404 if staff member does not exist", async () => {
      const fakeId = "123e4567-e89b-12d3-a456-426614174000";
      const response = await request(app)
        .get(`/api/v1/businesses/${businessId}/staff/${fakeId}`)
        .set("Authorization", `Bearer ${owner.token}`);

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("NOT_FOUND");
    });

    it("returns 404 if staff member belongs to a different business", async () => {
      const other = await addStaffTo(secondBusinessId, staffOneEmail);

      const response = await request(app)
        .get(`/api/v1/businesses/${businessId}/staff/${other.body.id}`)
        .set("Authorization", `Bearer ${owner.token}`);

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("NOT_FOUND");
    });

    it("returns 404 when the membership is not a STAFF membership", async () => {
      const ownerMembership = await prisma.businessMembership.findUniqueOrThrow({
        where: {
          userId_businessId: {
            userId: owner.userId,
            businessId,
          },
        },
      });

      const response = await request(app)
        .get(`/api/v1/businesses/${businessId}/staff/${ownerMembership.id}`)
        .set("Authorization", `Bearer ${owner.token}`);

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("NOT_FOUND");
    });
  });

  describe("PATCH /api/v1/businesses/:id/staff/:staffId", () => {
    let staffId: string;

    beforeEach(async () => {
      const res = await addStaff(staffOneEmail);
      staffId = res.body.id;
    });

    it("updates staff status and profile information", async () => {
      const response = await request(app)
        .patch(`/api/v1/businesses/${businessId}/staff/${staffId}`)
        .set("Authorization", `Bearer ${owner.token}`)
        .send({
          status: "SUSPENDED",
          firstName: "Samuel",
          phone: "+1999888777",
        });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe("SUSPENDED");
      expect(response.body.user.firstName).toBe("Samuel");
      expect(response.body.user.phone).toBe("+1999888777");
      expect(response.body.user.lastName).toBe("Staff");
    });

    it("returns 400 when no fields are provided", async () => {
      const response = await request(app)
        .patch(`/api/v1/businesses/${businessId}/staff/${staffId}`)
        .set("Authorization", `Bearer ${owner.token}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("returns 403 when an active STAFF member tries to update staff", async () => {
      const response = await request(app)
        .patch(`/api/v1/businesses/${businessId}/staff/${staffId}`)
        .set("Authorization", `Bearer ${staffOne.token}`)
        .send({ status: "SUSPENDED" });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("FORBIDDEN");
    });

    it("returns 404 when staff member belongs to a different business", async () => {
      const other = await addStaffTo(secondBusinessId, staffOneEmail);

      const response = await request(app)
        .patch(`/api/v1/businesses/${businessId}/staff/${other.body.id}`)
        .set("Authorization", `Bearer ${owner.token}`)
        .send({ status: "SUSPENDED" });

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("NOT_FOUND");
    });
  });

  describe("PUT /api/v1/businesses/:id/staff/:staffId/services", () => {
    let staffId: string;

    beforeEach(async () => {
      const res = await addStaff(staffOneEmail);
      staffId = res.body.id;
    });

    it("assigns services to a staff member", async () => {
      const haircut = await createService("Haircut");
      const shave = await createService("Shave");

      const response = await request(app)
        .put(`/api/v1/businesses/${businessId}/staff/${staffId}/services`)
        .set("Authorization", `Bearer ${owner.token}`)
        .send({ serviceIds: [haircut.id, shave.id] });

      expect(response.status).toBe(200);
      expect(response.body.staffServices).toHaveLength(2);
      const names = response.body.staffServices.map((s: any) => s.service.name).sort();
      expect(names).toEqual(["Haircut", "Shave"]);
    });

    it("replaces the existing service assignments", async () => {
      const haircut = await createService("Haircut");
      const shave = await createService("Shave");

      await request(app)
        .put(`/api/v1/businesses/${businessId}/staff/${staffId}/services`)
        .set("Authorization", `Bearer ${owner.token}`)
        .send({ serviceIds: [haircut.id] });

      const response = await request(app)
        .put(`/api/v1/businesses/${businessId}/staff/${staffId}/services`)
        .set("Authorization", `Bearer ${owner.token}`)
        .send({ serviceIds: [shave.id] });

      expect(response.status).toBe(200);
      expect(response.body.staffServices).toHaveLength(1);
      expect(response.body.staffServices[0].service.name).toBe("Shave");
    });

    it("clears all service assignments when given an empty list", async () => {
      const haircut = await createService("Haircut");

      await request(app)
        .put(`/api/v1/businesses/${businessId}/staff/${staffId}/services`)
        .set("Authorization", `Bearer ${owner.token}`)
        .send({ serviceIds: [haircut.id] });

      const response = await request(app)
        .put(`/api/v1/businesses/${businessId}/staff/${staffId}/services`)
        .set("Authorization", `Bearer ${owner.token}`)
        .send({ serviceIds: [] });

      expect(response.status).toBe(200);
      expect(response.body.staffServices).toEqual([]);
    });

    it("returns 400 when a service belongs to a different business", async () => {
      const foreignService = await createService("Foreign", secondBusinessId);

      const response = await request(app)
        .put(`/api/v1/businesses/${businessId}/staff/${staffId}/services`)
        .set("Authorization", `Bearer ${owner.token}`)
        .send({ serviceIds: [foreignService.id] });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("BAD_REQUEST");
    });

    it("returns 400 when a service does not exist", async () => {
      const response = await request(app)
        .put(`/api/v1/businesses/${businessId}/staff/${staffId}/services`)
        .set("Authorization", `Bearer ${owner.token}`)
        .send({ serviceIds: ["123e4567-e89b-12d3-a456-426614174000"] });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("BAD_REQUEST");
    });

    it("returns 403 when an active STAFF member tries to assign services", async () => {
      const haircut = await createService("Haircut");

      const response = await request(app)
        .put(`/api/v1/businesses/${businessId}/staff/${staffId}/services`)
        .set("Authorization", `Bearer ${staffOne.token}`)
        .send({ serviceIds: [haircut.id] });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("FORBIDDEN");
    });
  });

  describe("PUT /api/v1/businesses/:id/staff/:staffId/schedule", () => {
    let staffId: string;

    beforeEach(async () => {
      const res = await addStaff(staffOneEmail);
      staffId = res.body.id;
    });

    it("replaces the staff weekly schedule", async () => {
      const response = await request(app)
        .put(`/api/v1/businesses/${businessId}/staff/${staffId}/schedule`)
        .set("Authorization", `Bearer ${owner.token}`)
        .send({
          schedule: [
            { dayOfWeek: 1, startTime: "09:00", endTime: "17:00" },
            { dayOfWeek: 2, isOff: true },
          ],
        });

      expect(response.status).toBe(200);
      expect(response.body.workingHours).toHaveLength(2);
      expect(response.body.workingHours[0].dayOfWeek).toBe(1);
      expect(response.body.workingHours[0].isOff).toBe(false);
      expect(response.body.workingHours[1].dayOfWeek).toBe(2);
      expect(response.body.workingHours[1].isOff).toBe(true);
    });

    it("replaces a previously saved schedule", async () => {
      await request(app)
        .put(`/api/v1/businesses/${businessId}/staff/${staffId}/schedule`)
        .set("Authorization", `Bearer ${owner.token}`)
        .send({
          schedule: [
            { dayOfWeek: 1, startTime: "09:00", endTime: "17:00" },
            { dayOfWeek: 3, startTime: "10:00", endTime: "16:00" },
          ],
        });

      const response = await request(app)
        .put(`/api/v1/businesses/${businessId}/staff/${staffId}/schedule`)
        .set("Authorization", `Bearer ${owner.token}`)
        .send({
          schedule: [{ dayOfWeek: 5, startTime: "08:00", endTime: "12:00" }],
        });

      expect(response.status).toBe(200);
      expect(response.body.workingHours).toHaveLength(1);
      expect(response.body.workingHours[0].dayOfWeek).toBe(5);
    });

    it("returns 400 when the same day appears twice", async () => {
      const response = await request(app)
        .put(`/api/v1/businesses/${businessId}/staff/${staffId}/schedule`)
        .set("Authorization", `Bearer ${owner.token}`)
        .send({
          schedule: [
            { dayOfWeek: 1, startTime: "09:00", endTime: "12:00" },
            { dayOfWeek: 1, startTime: "13:00", endTime: "17:00" },
          ],
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("returns 400 when start time is after end time", async () => {
      const response = await request(app)
        .put(`/api/v1/businesses/${businessId}/staff/${staffId}/schedule`)
        .set("Authorization", `Bearer ${owner.token}`)
        .send({
          schedule: [{ dayOfWeek: 1, startTime: "17:00", endTime: "09:00" }],
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("returns 400 when a time is not in HH:MM format", async () => {
      const response = await request(app)
        .put(`/api/v1/businesses/${businessId}/staff/${staffId}/schedule`)
        .set("Authorization", `Bearer ${owner.token}`)
        .send({
          schedule: [{ dayOfWeek: 1, startTime: "9:00", endTime: "17:00" }],
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("returns 403 when an active STAFF member tries to update the schedule", async () => {
      const response = await request(app)
        .put(`/api/v1/businesses/${businessId}/staff/${staffId}/schedule`)
        .set("Authorization", `Bearer ${staffOne.token}`)
        .send({
          schedule: [{ dayOfWeek: 1, startTime: "09:00", endTime: "17:00" }],
        });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("FORBIDDEN");
    });
  });
});
