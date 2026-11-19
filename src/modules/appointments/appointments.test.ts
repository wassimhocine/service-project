import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../../app.js";
import { prisma } from "../../infrastructure/prisma.js";

describe("Appointments Module", () => {
  const ownerEmail = "owner.appt.test@example.com";
  const staffOneEmail = "staff.one@appt.test";
  const staffTwoEmail = "staff.two@appt.test";
  const customerOneEmail = "customer.one@appt.test";
  const customerTwoEmail = "customer.two@appt.test";
  const noPhoneEmail = "no.phone@appt.test";
  const password = "Password123!";

  const monday = "2027-03-01";
  const at = (time: string) => `${monday}T${time}:00.000Z`;
  const time = (hours: number, minutes = 0) =>
    new Date(Date.UTC(1970, 0, 1, hours, minutes, 0, 0));

  let owner: { token: string; userId: string };
  let staffOne: { token: string; userId: string };
  let staffTwo: { token: string; userId: string };
  let customerOne: { token: string; userId: string };
  let customerTwo: { token: string; userId: string };
  let businessId: string;
  let secondBusinessId: string;
  let staffOneMembershipId: string;
  let staffTwoMembershipId: string;
  let serviceId: string;
  let customerTwoRecordId: string;

  const cleanDatabase = async () => {
    const testUsers = await prisma.user.findMany({
      where: {
        email: {
          in: [
            ownerEmail,
            staffOneEmail,
            staffTwoEmail,
            customerOneEmail,
            customerTwoEmail,
            noPhoneEmail,
          ],
        },
      },
      select: { id: true },
    });
    const userIds = testUsers.map((u) => u.id);

    const testBusinesses = await prisma.business.findMany({
      where: { email: { contains: "appt.test" } },
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

  const registerUser = async (
    email: string,
    firstName: string,
    lastName: string,
    phone?: string
  ) => {
    const res = await request(app).post("/api/v1/auth/register").send({
      email,
      password,
      firstName,
      lastName,
      ...(phone !== undefined && { phone }),
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
        email: `${slug}@appt.test`,
        phone: "+1234567890",
        timezone: "UTC",
      });
    return res.body.id as string;
  };

  const book = (
    token: string,
    body: Record<string, unknown>,
    targetBusinessId = businessId
  ) =>
    request(app)
      .post(`/api/v1/businesses/${targetBusinessId}/appointments`)
      .set("Authorization", `Bearer ${token}`)
      .send(body);

  const createCustomerRecord = async (userId: string, email: string) =>
    prisma.customer.create({
      data: {
        businessId,
        userId,
        firstName: "Customer",
        lastName: "Two",
        email,
        phone: "+15550002222",
      },
    });

  beforeAll(async () => {
    await cleanDatabase();
  });

  beforeEach(async () => {
    await cleanDatabase();

    owner = await registerUser(ownerEmail, "Owner", "ApptTest", "+15550000001");
    staffOne = await registerUser(staffOneEmail, "Sam", "Staff", "+15550000002");
    staffTwo = await registerUser(staffTwoEmail, "Nina", "Staff", "+15550000003");
    customerOne = await registerUser(customerOneEmail, "Cara", "Customer", "+15550000004");
    customerTwo = await registerUser(customerTwoEmail, "Chris", "Customer", "+15550000005");

    businessId = await createBusiness(owner.token, "Appt Salon", "appt-salon");
    secondBusinessId = await createBusiness(owner.token, "Appt Salon Two", "appt-salon-two");

    const staffOneMembership = await prisma.businessMembership.create({
      data: {
        userId: staffOne.userId,
        businessId,
        role: "STAFF",
        status: "ACTIVE",
      },
    });
    const staffTwoMembership = await prisma.businessMembership.create({
      data: {
        userId: staffTwo.userId,
        businessId,
        role: "STAFF",
        status: "ACTIVE",
      },
    });
    staffOneMembershipId = staffOneMembership.id;
    staffTwoMembershipId = staffTwoMembership.id;

    const service = await prisma.service.create({
      data: {
        businessId,
        name: "Haircut",
        durationMinutes: 30,
        price: "30.00",
      },
    });
    serviceId = service.id;

    await prisma.staffService.createMany({
      data: [
        { staffId: staffOneMembershipId, serviceId },
        { staffId: staffTwoMembershipId, serviceId },
      ],
    });

    await prisma.businessWorkingHours.create({
      data: {
        businessId,
        dayOfWeek: 1,
        startTime: time(9),
        endTime: time(17),
        isClosed: false,
      },
    });

    const customerTwoRecord = await createCustomerRecord(customerTwo.userId, customerTwoEmail);
    customerTwoRecordId = customerTwoRecord.id;
  });

  afterAll(async () => {
    await cleanDatabase();
  });

  describe("POST /api/v1/businesses/:id/appointments", () => {
    it("returns 401 when unauthenticated", async () => {
      const response = await request(app)
        .post(`/api/v1/businesses/${businessId}/appointments`)
        .send({ serviceId, staffId: staffOneMembershipId, startTime: at("09:00") });

      expect(response.status).toBe(401);
    });

    it("returns 400 when required fields are missing", async () => {
      const response = await book(owner.token, { startTime: at("09:00") });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("lets an authenticated customer book for themselves", async () => {
      const response = await book(customerOne.token, {
        serviceId,
        staffId: staffOneMembershipId,
        startTime: at("09:00"),
        notes: "First visit",
      });

      expect(response.status).toBe(201);
      expect(response.body.status).toBe("PENDING");
      expect(response.body.customer.userId).toBe(customerOne.userId);
      expect(response.body.staff.id).toBe(staffOneMembershipId);
      expect(response.body.service.id).toBe(serviceId);
      expect(response.body.durationMinutes).toBe(30);
      expect(Number(response.body.price)).toBe(30);
      expect(response.body.endTime).toBe(at("09:30"));

      const customer = await prisma.customer.findFirst({
        where: { businessId, userId: customerOne.userId },
      });
      expect(customer).not.toBeNull();
    });

    it("lets a manager book on behalf of an existing customer", async () => {
      const response = await book(owner.token, {
        customerId: customerTwoRecordId,
        serviceId,
        staffId: staffOneMembershipId,
        startTime: at("09:00"),
      });

      expect(response.status).toBe(201);
      expect(response.body.customer.id).toBe(customerTwoRecordId);
    });

    it("lets staff book an appointment assigned to themselves", async () => {
      const response = await book(staffOne.token, {
        customerId: customerTwoRecordId,
        serviceId,
        staffId: staffOneMembershipId,
        startTime: at("09:00"),
      });

      expect(response.status).toBe(201);
      expect(response.body.staff.id).toBe(staffOneMembershipId);
    });

    it("returns 403 when staff tries to book for another staff member", async () => {
      const response = await book(staffOne.token, {
        customerId: customerTwoRecordId,
        serviceId,
        staffId: staffTwoMembershipId,
        startTime: at("09:00"),
      });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("FORBIDDEN");
    });

    it("returns 404 when the service belongs to another business", async () => {
      const foreignService = await prisma.service.create({
        data: {
          businessId: secondBusinessId,
          name: "Foreign",
          durationMinutes: 30,
          price: "10.00",
        },
      });

      const response = await book(owner.token, {
        customerId: customerTwoRecordId,
        serviceId: foreignService.id,
        staffId: staffOneMembershipId,
        startTime: at("09:00"),
      });

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("NOT_FOUND");
    });

    it("returns 404 when the staff member belongs to another business", async () => {
      const foreignStaff = await prisma.businessMembership.create({
        data: {
          userId: staffTwo.userId,
          businessId: secondBusinessId,
          role: "STAFF",
          status: "ACTIVE",
        },
      });

      const response = await book(owner.token, {
        customerId: customerTwoRecordId,
        serviceId,
        staffId: foreignStaff.id,
        startTime: at("09:00"),
      });

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("NOT_FOUND");
    });

    it("returns 409 when the staff member does not provide the service", async () => {
      const otherService = await prisma.service.create({
        data: {
          businessId,
          name: "Colour",
          durationMinutes: 60,
          price: "80.00",
        },
      });

      const response = await book(owner.token, {
        customerId: customerTwoRecordId,
        serviceId: otherService.id,
        staffId: staffOneMembershipId,
        startTime: at("09:00"),
      });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("CONFLICT");
    });

    it("returns 409 when the service is inactive", async () => {
      await prisma.service.update({
        where: { id: serviceId },
        data: { status: "INACTIVE" },
      });

      const response = await book(customerOne.token, {
        serviceId,
        staffId: staffOneMembershipId,
        startTime: at("09:00"),
      });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("CONFLICT");
    });

    it("returns 409 when the appointment is outside business hours", async () => {
      const response = await book(customerOne.token, {
        serviceId,
        staffId: staffOneMembershipId,
        startTime: at("08:00"),
      });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("CONFLICT");
    });

    it("returns 409 on a holiday", async () => {
      await prisma.scheduleException.create({
        data: {
          businessId,
          staffId: null,
          date: new Date(`${monday}T00:00:00.000Z`),
          type: "HOLIDAY",
          reason: "Public holiday",
        },
      });

      const response = await book(customerOne.token, {
        serviceId,
        staffId: staffOneMembershipId,
        startTime: at("09:00"),
      });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("CONFLICT");
    });

    it("returns 409 when outside the staff member's own hours", async () => {
      await prisma.staffWorkingHours.create({
        data: {
          staffId: staffOneMembershipId,
          dayOfWeek: 1,
          startTime: time(10),
          endTime: time(12),
          isOff: false,
        },
      });

      const response = await book(customerOne.token, {
        serviceId,
        staffId: staffOneMembershipId,
        startTime: at("09:00"),
      });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("CONFLICT");
    });

    it("prevents overlapping appointments but allows adjacent ones", async () => {
      const first = await book(customerOne.token, {
        serviceId,
        staffId: staffOneMembershipId,
        startTime: at("09:00"),
      });
      expect(first.status).toBe(201);

      const overlap = await book(customerTwo.token, {
        serviceId,
        staffId: staffOneMembershipId,
        startTime: at("09:15"),
      });
      expect(overlap.status).toBe(409);
      expect(overlap.body.error.code).toBe("CONFLICT");

      const adjacent = await book(customerTwo.token, {
        serviceId,
        staffId: staffOneMembershipId,
        startTime: at("09:30"),
      });
      expect(adjacent.status).toBe(201);
    });

    it("chooses any available staff member when staffId is omitted", async () => {
      const response = await book(customerOne.token, {
        serviceId,
        startTime: at("09:00"),
      });

      expect(response.status).toBe(201);
      expect([staffOneMembershipId, staffTwoMembershipId]).toContain(response.body.staff.id);
    });

    it("returns 409 when the selected staff member is not active", async () => {
      await prisma.businessMembership.update({
        where: { id: staffTwoMembershipId },
        data: { status: "SUSPENDED" },
      });

      const response = await book(owner.token, {
        customerId: customerTwoRecordId,
        serviceId,
        staffId: staffTwoMembershipId,
        startTime: at("09:00"),
      });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("CONFLICT");
    });

    it("returns 400 when a customer without a phone number books", async () => {
      const noPhoneUser = await registerUser(noPhoneEmail, "No", "Phone");

      const response = await book(noPhoneUser.token, {
        serviceId,
        staffId: staffOneMembershipId,
        startTime: at("09:00"),
      });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("BAD_REQUEST");
    });

    it("returns 403 when a customer supplies another customer's ID", async () => {
      const response = await book(customerOne.token, {
        customerId: customerTwoRecordId,
        serviceId,
        staffId: staffOneMembershipId,
        startTime: at("09:00"),
      });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("FORBIDDEN");
    });

    it("evaluates hours in the business timezone", async () => {
      await prisma.business.update({
        where: { id: businessId },
        data: { timezone: "America/New_York" },
      });

      const early = await book(customerOne.token, {
        serviceId,
        staffId: staffOneMembershipId,
        startTime: "2027-03-01T13:00:00.000Z",
      });
      expect(early.status).toBe(409);

      const opening = await book(customerOne.token, {
        serviceId,
        staffId: staffOneMembershipId,
        startTime: "2027-03-01T14:00:00.000Z",
      });
      expect(opening.status).toBe(201);

      const later = await book(customerTwo.token, {
        serviceId,
        staffId: staffOneMembershipId,
        startTime: "2027-03-01T15:00:00.000Z",
      });
      expect(later.status).toBe(201);
    });

    it("returns 409 for appointments in the past", async () => {
      const response = await book(customerOne.token, {
        serviceId,
        staffId: staffOneMembershipId,
        startTime: "2020-01-06T09:00:00.000Z",
      });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("CONFLICT");
    });
  });

  describe("GET /api/v1/businesses/:id/appointments", () => {
    it("returns 401 when unauthenticated", async () => {
      const response = await request(app).get(
        `/api/v1/businesses/${businessId}/appointments`
      );

      expect(response.status).toBe(401);
    });

    it("lets a customer see only their own appointments", async () => {
      await book(customerOne.token, {
        serviceId,
        staffId: staffOneMembershipId,
        startTime: at("09:00"),
      });
      await book(customerTwo.token, {
        serviceId,
        staffId: staffTwoMembershipId,
        startTime: at("10:00"),
      });

      const response = await request(app)
        .get(`/api/v1/businesses/${businessId}/appointments`)
        .set("Authorization", `Bearer ${customerOne.token}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].customer.userId).toBe(customerOne.userId);
    });

    it("lets staff see only their own appointments", async () => {
      await book(customerOne.token, {
        serviceId,
        staffId: staffOneMembershipId,
        startTime: at("09:00"),
      });
      await book(customerTwo.token, {
        serviceId,
        staffId: staffTwoMembershipId,
        startTime: at("10:00"),
      });

      const response = await request(app)
        .get(`/api/v1/businesses/${businessId}/appointments`)
        .set("Authorization", `Bearer ${staffOne.token}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].staff.id).toBe(staffOneMembershipId);
    });

    it("lets a manager list, filter and paginate all appointments", async () => {
      const first = await book(customerOne.token, {
        serviceId,
        staffId: staffOneMembershipId,
        startTime: at("09:00"),
      });
      const second = await book(customerTwo.token, {
        serviceId,
        staffId: staffTwoMembershipId,
        startTime: at("10:00"),
      });

      await request(app)
        .patch(`/api/v1/businesses/${businessId}/appointments/${first.body.id}`)
        .set("Authorization", `Bearer ${owner.token}`)
        .send({ status: "CONFIRMED" });

      const all = await request(app)
        .get(`/api/v1/businesses/${businessId}/appointments`)
        .set("Authorization", `Bearer ${owner.token}`);
      expect(all.status).toBe(200);
      expect(all.body.pagination.total).toBe(2);

      const confirmed = await request(app)
        .get(`/api/v1/businesses/${businessId}/appointments?status=CONFIRMED`)
        .set("Authorization", `Bearer ${owner.token}`);
      expect(confirmed.body.data).toHaveLength(1);
      expect(confirmed.body.data[0].id).toBe(first.body.id);

      const byStaff = await request(app)
        .get(
          `/api/v1/businesses/${businessId}/appointments?staffId=${staffTwoMembershipId}`
        )
        .set("Authorization", `Bearer ${owner.token}`);
      expect(byStaff.body.data).toHaveLength(1);
      expect(byStaff.body.data[0].id).toBe(second.body.id);

      const windowed = await request(app)
        .get(
          `/api/v1/businesses/${businessId}/appointments?from=${at("09:30")}&to=${at("11:00")}`
        )
        .set("Authorization", `Bearer ${owner.token}`);
      expect(windowed.body.data).toHaveLength(1);

      const paginated = await request(app)
        .get(`/api/v1/businesses/${businessId}/appointments?page=1&limit=1`)
        .set("Authorization", `Bearer ${owner.token}`);
      expect(paginated.body.data).toHaveLength(1);
      expect(paginated.body.pagination.total).toBe(2);
      expect(paginated.body.pagination.totalPages).toBe(2);
    });
  });

  describe("GET /api/v1/businesses/:id/appointments/:appointmentId", () => {
    it("lets a customer read their own appointment", async () => {
      const created = await book(customerOne.token, {
        serviceId,
        staffId: staffOneMembershipId,
        startTime: at("09:00"),
      });

      const response = await request(app)
        .get(`/api/v1/businesses/${businessId}/appointments/${created.body.id}`)
        .set("Authorization", `Bearer ${customerOne.token}`);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(created.body.id);
    });

    it("returns 404 when a customer requests another customer's appointment", async () => {
      const created = await book(customerOne.token, {
        serviceId,
        staffId: staffOneMembershipId,
        startTime: at("09:00"),
      });

      const response = await request(app)
        .get(`/api/v1/businesses/${businessId}/appointments/${created.body.id}`)
        .set("Authorization", `Bearer ${customerTwo.token}`);

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("NOT_FOUND");
    });

    it("returns 404 when the appointment belongs to a different business", async () => {
      const created = await book(customerOne.token, {
        serviceId,
        staffId: staffOneMembershipId,
        startTime: at("09:00"),
      });

      const response = await request(app)
        .get(`/api/v1/businesses/${secondBusinessId}/appointments/${created.body.id}`)
        .set("Authorization", `Bearer ${owner.token}`);

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("NOT_FOUND");
    });
  });

  describe("PATCH /api/v1/businesses/:id/appointments/:appointmentId", () => {
    it("updates appointment notes", async () => {
      const created = await book(customerOne.token, {
        serviceId,
        staffId: staffOneMembershipId,
        startTime: at("09:00"),
      });

      const response = await request(app)
        .patch(`/api/v1/businesses/${businessId}/appointments/${created.body.id}`)
        .set("Authorization", `Bearer ${owner.token}`)
        .send({ notes: "Bring reference photos" });

      expect(response.status).toBe(200);
      expect(response.body.notes).toBe("Bring reference photos");
    });

    it("returns 400 when no fields are provided", async () => {
      const created = await book(customerOne.token, {
        serviceId,
        staffId: staffOneMembershipId,
        startTime: at("09:00"),
      });

      const response = await request(app)
        .patch(`/api/v1/businesses/${businessId}/appointments/${created.body.id}`)
        .set("Authorization", `Bearer ${owner.token}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("returns 403 when a customer tries to update an appointment", async () => {
      const created = await book(customerOne.token, {
        serviceId,
        staffId: staffOneMembershipId,
        startTime: at("09:00"),
      });

      const response = await request(app)
        .patch(`/api/v1/businesses/${businessId}/appointments/${created.body.id}`)
        .set("Authorization", `Bearer ${customerOne.token}`)
        .send({ notes: "Changed" });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("FORBIDDEN");
    });

    it("confirms a pending appointment", async () => {
      const created = await book(customerOne.token, {
        serviceId,
        staffId: staffOneMembershipId,
        startTime: at("09:00"),
      });

      const response = await request(app)
        .patch(`/api/v1/businesses/${businessId}/appointments/${created.body.id}`)
        .set("Authorization", `Bearer ${owner.token}`)
        .send({ status: "CONFIRMED" });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe("CONFIRMED");
    });
  });

  describe("Appointment lifecycle actions", () => {
    it("cancels an appointment and rejects a second cancellation", async () => {
      const created = await book(customerOne.token, {
        serviceId,
        staffId: staffOneMembershipId,
        startTime: at("09:00"),
      });

      const cancelled = await request(app)
        .post(
          `/api/v1/businesses/${businessId}/appointments/${created.body.id}/cancel`
        )
        .set("Authorization", `Bearer ${customerOne.token}`);

      expect(cancelled.status).toBe(200);
      expect(cancelled.body.status).toBe("CANCELLED");
      expect(cancelled.body.cancelledAt).not.toBeNull();

      const repeat = await request(app)
        .post(
          `/api/v1/businesses/${businessId}/appointments/${created.body.id}/cancel`
        )
        .set("Authorization", `Bearer ${customerOne.token}`);

      expect(repeat.status).toBe(409);
      expect(repeat.body.error.code).toBe("CONFLICT");
    });

    it("rejects completing a pending appointment, then completes a confirmed one", async () => {
      const created = await book(customerOne.token, {
        serviceId,
        staffId: staffOneMembershipId,
        startTime: at("09:00"),
      });

      const early = await request(app)
        .post(
          `/api/v1/businesses/${businessId}/appointments/${created.body.id}/complete`
        )
        .set("Authorization", `Bearer ${owner.token}`);
      expect(early.status).toBe(409);

      await request(app)
        .patch(`/api/v1/businesses/${businessId}/appointments/${created.body.id}`)
        .set("Authorization", `Bearer ${owner.token}`)
        .send({ status: "CONFIRMED" });

      const completed = await request(app)
        .post(
          `/api/v1/businesses/${businessId}/appointments/${created.body.id}/complete`
        )
        .set("Authorization", `Bearer ${owner.token}`);

      expect(completed.status).toBe(200);
      expect(completed.body.status).toBe("COMPLETED");
      expect(completed.body.completedAt).not.toBeNull();
    });

    it("marks a confirmed appointment as no-show", async () => {
      const created = await book(customerOne.token, {
        serviceId,
        staffId: staffOneMembershipId,
        startTime: at("09:00"),
      });

      await request(app)
        .patch(`/api/v1/businesses/${businessId}/appointments/${created.body.id}`)
        .set("Authorization", `Bearer ${owner.token}`)
        .send({ status: "CONFIRMED" });

      const response = await request(app)
        .post(
          `/api/v1/businesses/${businessId}/appointments/${created.body.id}/no-show`
        )
        .set("Authorization", `Bearer ${owner.token}`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe("NO_SHOW");
    });

    it("reschedules to a free slot, rejects overlap and terminal states", async () => {
      const first = await book(customerOne.token, {
        serviceId,
        staffId: staffOneMembershipId,
        startTime: at("09:00"),
      });
      const second = await book(customerTwo.token, {
        serviceId,
        staffId: staffOneMembershipId,
        startTime: at("10:00"),
      });

      const moved = await request(app)
        .post(
          `/api/v1/businesses/${businessId}/appointments/${first.body.id}/reschedule`
        )
        .set("Authorization", `Bearer ${owner.token}`)
        .send({ startTime: at("11:00") });

      expect(moved.status).toBe(200);
      expect(moved.body.startTime).toBe(at("11:00"));
      expect(moved.body.endTime).toBe(at("11:30"));

      const overlap = await request(app)
        .post(
          `/api/v1/businesses/${businessId}/appointments/${first.body.id}/reschedule`
        )
        .set("Authorization", `Bearer ${owner.token}`)
        .send({ startTime: at("10:00") });

      expect(overlap.status).toBe(409);
      expect(second.status).toBe(201);

      await request(app)
        .post(
          `/api/v1/businesses/${businessId}/appointments/${first.body.id}/cancel`
        )
        .set("Authorization", `Bearer ${owner.token}`);

      const terminal = await request(app)
        .post(
          `/api/v1/businesses/${businessId}/appointments/${first.body.id}/reschedule`
        )
        .set("Authorization", `Bearer ${owner.token}`)
        .send({ startTime: at("12:00") });

      expect(terminal.status).toBe(409);
      expect(terminal.body.error.code).toBe("CONFLICT");
    });

    it("lets a customer reschedule their own appointment", async () => {
      const created = await book(customerOne.token, {
        serviceId,
        staffId: staffOneMembershipId,
        startTime: at("09:00"),
      });

      const response = await request(app)
        .post(
          `/api/v1/businesses/${businessId}/appointments/${created.body.id}/reschedule`
        )
        .set("Authorization", `Bearer ${customerOne.token}`)
        .send({ startTime: at("10:00") });

      expect(response.status).toBe(200);
      expect(response.body.startTime).toBe(at("10:00"));
    });

    it("returns 404 when staff touches another staff member's appointment", async () => {
      const created = await book(customerTwo.token, {
        serviceId,
        staffId: staffTwoMembershipId,
        startTime: at("09:00"),
      });

      const response = await request(app)
        .post(
          `/api/v1/businesses/${businessId}/appointments/${created.body.id}/complete`
        )
        .set("Authorization", `Bearer ${staffOne.token}`);

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("NOT_FOUND");
    });
  });
});
