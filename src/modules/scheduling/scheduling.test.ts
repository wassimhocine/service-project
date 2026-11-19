import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../../app.js";
import { prisma } from "../../infrastructure/prisma.js";

const nextMonday = (): string => {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + 7);

  while (date.getUTCDay() !== 1) {
    date.setUTCDate(date.getUTCDate() + 1);
  }

  return date.toISOString().slice(0, 10);
};

const addDays = (dateKey: string, days: number): string => {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

describe("Scheduling Module", () => {
  const ownerEmail = "owner@sch.test";
  const managerEmail = "manager@sch.test";
  const staffOneEmail = "staff.one@sch.test";
  const staffTwoEmail = "staff.two@sch.test";
  const outsiderEmail = "outsider@sch.test";
  const password = "Password123!";

  const monday = nextMonday();
  const at = (time: string) => `${monday}T${time}:00.000Z`;
  const time = (hours: number, minutes = 0) =>
    new Date(Date.UTC(1970, 0, 1, hours, minutes, 0, 0));

  let owner: { token: string; userId: string };
  let manager: { token: string; userId: string };
  let staffOne: { token: string; userId: string };
  let staffTwo: { token: string; userId: string };
  let outsider: { token: string; userId: string };
  let businessId: string;
  let staffOneMembershipId: string;
  let staffTwoMembershipId: string;
  let serviceId: string;
  let customerId: string;

  const cleanDatabase = async () => {
    const testUsers = await prisma.user.findMany({
      where: {
        email: {
          in: [ownerEmail, managerEmail, staffOneEmail, staffTwoEmail, outsiderEmail],
        },
      },
      select: { id: true },
    });
    const userIds = testUsers.map((user) => user.id);

    const testBusinesses = await prisma.business.findMany({
      where: { email: { contains: "sch.test" } },
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
      await prisma.business.deleteMany({ where: { id: { in: businessIds } } });
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
      lastName: "SchTest",
      phone: "+15550002222",
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
        email: `${slug}@sch.test`,
        phone: "+1234567890",
        timezone: "UTC",
      });

    return response.body.id as string;
  };

  const getAvailability = (token: string, query: string) =>
    request(app)
      .get(`/api/v1/businesses/${businessId}/availability?${query}`)
      .set("Authorization", `Bearer ${token}`);

  const slotStarts = (body: { slots: { startTime: string }[] }) =>
    body.slots.map((slot) => slot.startTime);

  beforeAll(async () => {
    await cleanDatabase();
  });

  beforeEach(async () => {
    await cleanDatabase();

    owner = await registerUser(ownerEmail, "Owner");
    manager = await registerUser(managerEmail, "Manager");
    staffOne = await registerUser(staffOneEmail, "Sam");
    staffTwo = await registerUser(staffTwoEmail, "Nina");
    outsider = await registerUser(outsiderEmail, "Outsider");

    businessId = await createBusiness(owner.token, "Sch Salon", "sch-salon");

    await prisma.businessMembership.create({
      data: {
        userId: manager.userId,
        businessId,
        role: "MANAGER",
        status: "ACTIVE",
      },
    });

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

    const customer = await prisma.customer.create({
      data: {
        businessId,
        firstName: "Walk",
        lastName: "In",
        email: "walkin@sch.test",
        phone: "+15550009999",
      },
    });
    customerId = customer.id;
  });

  afterAll(async () => {
    await cleanDatabase();
  });

  describe("GET /api/v1/businesses/:id/working-hours", () => {
    it("returns 401 when unauthenticated", async () => {
      const response = await request(app).get(
        `/api/v1/businesses/${businessId}/working-hours`
      );

      expect(response.status).toBe(401);
    });

    it("returns the full week, treating unconfigured days as closed", async () => {
      const response = await request(app)
        .get(`/api/v1/businesses/${businessId}/working-hours`)
        .set("Authorization", `Bearer ${staffOne.token}`);

      expect(response.status).toBe(200);
      expect(response.body.timezone).toBe("UTC");
      expect(response.body.schedule).toHaveLength(7);

      const mondayEntry = response.body.schedule.find(
        (entry: { dayOfWeek: number }) => entry.dayOfWeek === 1
      );
      expect(mondayEntry.day).toBe("Monday");
      expect(mondayEntry.startTime).toBe("09:00");
      expect(mondayEntry.endTime).toBe("17:00");
      expect(mondayEntry.isClosed).toBe(false);

      const tuesdayEntry = response.body.schedule.find(
        (entry: { dayOfWeek: number }) => entry.dayOfWeek === 2
      );
      expect(tuesdayEntry.isClosed).toBe(true);
      expect(tuesdayEntry.startTime).toBeNull();
    });

    it("returns 403 when a non-member requests the schedule", async () => {
      const response = await request(app)
        .get(`/api/v1/businesses/${businessId}/working-hours`)
        .set("Authorization", `Bearer ${outsider.token}`);

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("FORBIDDEN");
    });
  });

  describe("PUT /api/v1/businesses/:id/working-hours", () => {
    it("lets an owner replace the weekly schedule", async () => {
      const response = await request(app)
        .put(`/api/v1/businesses/${businessId}/working-hours`)
        .set("Authorization", `Bearer ${owner.token}`)
        .send({
          schedule: [
            { dayOfWeek: 1, startTime: "08:00", endTime: "10:00" },
            { dayOfWeek: 2, isClosed: true },
          ],
        });

      expect(response.status).toBe(200);

      const mondayEntry = response.body.schedule.find(
        (entry: { dayOfWeek: number }) => entry.dayOfWeek === 1
      );
      expect(mondayEntry.startTime).toBe("08:00");
      expect(mondayEntry.endTime).toBe("10:00");

      const tuesdayEntry = response.body.schedule.find(
        (entry: { dayOfWeek: number }) => entry.dayOfWeek === 2
      );
      expect(tuesdayEntry.isClosed).toBe(true);

      expect(await prisma.businessWorkingHours.count({ where: { businessId } })).toBe(2);
    });

    it("lets a manager update the schedule", async () => {
      const response = await request(app)
        .put(`/api/v1/businesses/${businessId}/working-hours`)
        .set("Authorization", `Bearer ${manager.token}`)
        .send({
          schedule: [{ dayOfWeek: 3, startTime: "09:00", endTime: "12:00" }],
        });

      expect(response.status).toBe(200);
      expect(response.body.schedule.find((entry: any) => entry.dayOfWeek === 3).isClosed).toBe(
        false
      );
    });

    it("returns 403 when a staff member updates the schedule", async () => {
      const response = await request(app)
        .put(`/api/v1/businesses/${businessId}/working-hours`)
        .set("Authorization", `Bearer ${staffOne.token}`)
        .send({
          schedule: [{ dayOfWeek: 1, startTime: "09:00", endTime: "17:00" }],
        });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("FORBIDDEN");
    });

    it("rejects duplicate days and inverted time ranges", async () => {
      const duplicate = await request(app)
        .put(`/api/v1/businesses/${businessId}/working-hours`)
        .set("Authorization", `Bearer ${owner.token}`)
        .send({
          schedule: [
            { dayOfWeek: 1, startTime: "09:00", endTime: "17:00" },
            { dayOfWeek: 1, startTime: "10:00", endTime: "12:00" },
          ],
        });
      expect(duplicate.status).toBe(400);
      expect(duplicate.body.error.code).toBe("VALIDATION_ERROR");

      const inverted = await request(app)
        .put(`/api/v1/businesses/${businessId}/working-hours`)
        .set("Authorization", `Bearer ${owner.token}`)
        .send({
          schedule: [{ dayOfWeek: 1, startTime: "17:00", endTime: "09:00" }],
        });
      expect(inverted.status).toBe(400);
    });
  });

  describe("Exceptions", () => {
    it("creates a business-wide holiday", async () => {
      const response = await request(app)
        .post(`/api/v1/businesses/${businessId}/exceptions`)
        .set("Authorization", `Bearer ${owner.token}`)
        .send({ date: monday, type: "HOLIDAY", reason: "Public holiday" });

      expect(response.status).toBe(201);
      expect(response.body.date).toBe(monday);
      expect(response.body.type).toBe("HOLIDAY");
      expect(response.body.staffId).toBeNull();
      expect(response.body.startTime).toBeNull();
    });

    it("creates staff time off with a time range", async () => {
      const response = await request(app)
        .post(`/api/v1/businesses/${businessId}/exceptions`)
        .set("Authorization", `Bearer ${manager.token}`)
        .send({
          staffId: staffOneMembershipId,
          date: monday,
          type: "TIME_OFF",
          startTime: "14:00",
          endTime: "15:00",
          reason: "Dentist",
        });

      expect(response.status).toBe(201);
      expect(response.body.staffId).toBe(staffOneMembershipId);
      expect(response.body.startTime).toBe("14:00");
      expect(response.body.endTime).toBe("15:00");
    });

    it("returns 403 when a staff member creates an exception", async () => {
      const response = await request(app)
        .post(`/api/v1/businesses/${businessId}/exceptions`)
        .set("Authorization", `Bearer ${staffOne.token}`)
        .send({ date: monday, type: "HOLIDAY" });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("FORBIDDEN");
    });

    it("returns 404 when the staff member belongs to another business", async () => {
      const secondBusinessId = await createBusiness(
        owner.token,
        "Sch Salon Two",
        "sch-salon-two"
      );
      const foreignStaff = await prisma.businessMembership.create({
        data: {
          userId: staffTwo.userId,
          businessId: secondBusinessId,
          role: "STAFF",
          status: "ACTIVE",
        },
      });

      const response = await request(app)
        .post(`/api/v1/businesses/${businessId}/exceptions`)
        .set("Authorization", `Bearer ${owner.token}`)
        .send({
          staffId: foreignStaff.id,
          date: monday,
          type: "TIME_OFF",
          startTime: "09:00",
          endTime: "10:00",
        });

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("NOT_FOUND");
    });

    it("rejects invalid exception shapes", async () => {
      const businessTimeOff = await request(app)
        .post(`/api/v1/businesses/${businessId}/exceptions`)
        .set("Authorization", `Bearer ${owner.token}`)
        .send({ date: monday, type: "TIME_OFF", startTime: "09:00", endTime: "10:00" });
      expect(businessTimeOff.status).toBe(400);
      expect(businessTimeOff.body.error.code).toBe("BAD_REQUEST");

      const specialHours = await request(app)
        .post(`/api/v1/businesses/${businessId}/exceptions`)
        .set("Authorization", `Bearer ${owner.token}`)
        .send({ date: monday, type: "SPECIAL_HOURS" });
      expect(specialHours.status).toBe(400);
      expect(specialHours.body.error.code).toBe("VALIDATION_ERROR");

      const badDate = await request(app)
        .post(`/api/v1/businesses/${businessId}/exceptions`)
        .set("Authorization", `Bearer ${owner.token}`)
        .send({ date: "2027-02-30", type: "HOLIDAY" });
      expect(badDate.status).toBe(400);
    });

    it("lists and filters exceptions", async () => {
      await prisma.scheduleException.createMany({
        data: [
          {
            businessId,
            staffId: null,
            date: new Date(`${monday}T00:00:00.000Z`),
            type: "HOLIDAY",
          },
          {
            businessId,
            staffId: staffOneMembershipId,
            date: new Date(`${monday}T00:00:00.000Z`),
            type: "TIME_OFF",
            startTime: time(14),
            endTime: time(15),
          },
          {
            businessId,
            staffId: null,
            date: new Date(`${addDays(monday, 2)}T00:00:00.000Z`),
            type: "SPECIAL_HOURS",
            startTime: time(10),
            endTime: time(12),
          },
        ],
      });

      const all = await request(app)
        .get(`/api/v1/businesses/${businessId}/exceptions`)
        .set("Authorization", `Bearer ${staffTwo.token}`);
      expect(all.status).toBe(200);
      expect(all.body.pagination.total).toBe(3);

      const holidays = await request(app)
        .get(`/api/v1/businesses/${businessId}/exceptions?type=HOLIDAY`)
        .set("Authorization", `Bearer ${owner.token}`);
      expect(holidays.body.data).toHaveLength(1);

      const staffSpecific = await request(app)
        .get(
          `/api/v1/businesses/${businessId}/exceptions?staffId=${staffOneMembershipId}`
        )
        .set("Authorization", `Bearer ${owner.token}`);
      expect(staffSpecific.body.data).toHaveLength(1);
      expect(staffSpecific.body.data[0].type).toBe("TIME_OFF");

      const windowed = await request(app)
        .get(
          `/api/v1/businesses/${businessId}/exceptions?from=${addDays(
            monday,
            1
          )}&to=${addDays(monday, 3)}`
        )
        .set("Authorization", `Bearer ${owner.token}`);
      expect(windowed.body.data).toHaveLength(1);
      expect(windowed.body.data[0].type).toBe("SPECIAL_HOURS");

      const paginated = await request(app)
        .get(`/api/v1/businesses/${businessId}/exceptions?page=1&limit=2`)
        .set("Authorization", `Bearer ${owner.token}`);
      expect(paginated.body.data).toHaveLength(2);
      expect(paginated.body.pagination.totalPages).toBe(2);
    });
  });

  describe("GET /api/v1/businesses/:id/availability", () => {
    it("returns 401 when unauthenticated", async () => {
      const response = await request(app).get(
        `/api/v1/businesses/${businessId}/availability?date=${monday}&serviceId=${serviceId}`
      );

      expect(response.status).toBe(401);
    });

    it("returns evenly spaced slots for a single staff member", async () => {
      const response = await getAvailability(
        staffOne.token,
        `date=${monday}&serviceId=${serviceId}&staffId=${staffOneMembershipId}`
      );

      expect(response.status).toBe(200);
      expect(response.body.date).toBe(monday);
      expect(response.body.timezone).toBe("UTC");
      expect(response.body.staffId).toBe(staffOneMembershipId);
      expect(response.body.service.durationMinutes).toBe(30);
      expect(response.body.slots).toHaveLength(16);
      expect(response.body.slots[0].startTime).toBe(at("09:00"));
      expect(response.body.slots[0].endTime).toBe(at("09:30"));
      expect(response.body.slots[15].startTime).toBe(at("16:30"));
      expect(response.body.slots[0].staffIds).toEqual([staffOneMembershipId]);
    });

    it("unions slots across every active staff member when staffId is omitted", async () => {
      const response = await getAvailability(
        owner.token,
        `date=${monday}&serviceId=${serviceId}`
      );

      expect(response.status).toBe(200);
      expect(response.body.slots).toHaveLength(16);

      const opening = response.body.slots[0];
      expect(opening.staffIds).toContain(staffOneMembershipId);
      expect(opening.staffIds).toContain(staffTwoMembershipId);
    });

    it("excludes slots that overlap an active appointment", async () => {
      await prisma.appointment.create({
        data: {
          businessId,
          customerId,
          staffId: staffOneMembershipId,
          serviceId,
          startTime: new Date(at("10:00")),
          endTime: new Date(at("10:30")),
          durationMinutes: 30,
          price: "30.00",
          status: "CONFIRMED",
        },
      });

      const single = await getAvailability(
        owner.token,
        `date=${monday}&serviceId=${serviceId}&staffId=${staffOneMembershipId}`
      );
      expect(single.body.slots).toHaveLength(15);
      expect(slotStarts(single.body)).not.toContain(at("10:00"));
      expect(slotStarts(single.body)).toContain(at("09:30"));
      expect(slotStarts(single.body)).toContain(at("10:30"));

      const anyStaff = await getAvailability(
        owner.token,
        `date=${monday}&serviceId=${serviceId}`
      );
      const tenOClock = anyStaff.body.slots.find(
        (slot: { startTime: string }) => slot.startTime === at("10:00")
      );
      expect(tenOClock).toBeDefined();
      expect(tenOClock.staffIds).toEqual([staffTwoMembershipId]);
    });

    it("respects a staff member's own working hours", async () => {
      await prisma.staffWorkingHours.create({
        data: {
          staffId: staffOneMembershipId,
          dayOfWeek: 1,
          startTime: time(11),
          endTime: time(13),
          isOff: false,
        },
      });

      const response = await getAvailability(
        owner.token,
        `date=${monday}&serviceId=${serviceId}&staffId=${staffOneMembershipId}`
      );

      expect(response.status).toBe(200);
      expect(slotStarts(response.body)).toEqual([
        at("11:00"),
        at("11:30"),
        at("12:00"),
        at("12:30"),
      ]);
    });

    it("keeps a staff member with no explicit hours on the business schedule", async () => {
      await prisma.staffWorkingHours.create({
        data: {
          staffId: staffTwoMembershipId,
          dayOfWeek: 1,
          startTime: time(12),
          endTime: time(13),
          isOff: false,
        },
      });

      const response = await getAvailability(
        owner.token,
        `date=${monday}&serviceId=${serviceId}&staffId=${staffOneMembershipId}`
      );

      expect(response.body.slots).toHaveLength(16);
    });

    it("removes slots that overlap staff time off but keeps adjacent slots", async () => {
      await prisma.scheduleException.create({
        data: {
          businessId,
          staffId: staffOneMembershipId,
          date: new Date(`${monday}T00:00:00.000Z`),
          type: "TIME_OFF",
          startTime: time(14),
          endTime: time(15),
        },
      });

      const response = await getAvailability(
        owner.token,
        `date=${monday}&serviceId=${serviceId}&staffId=${staffOneMembershipId}`
      );

      expect(response.body.slots).toHaveLength(14);
      expect(slotStarts(response.body)).toContain(at("13:30"));
      expect(slotStarts(response.body)).not.toContain(at("14:00"));
      expect(slotStarts(response.body)).not.toContain(at("14:30"));
      expect(slotStarts(response.body)).toContain(at("15:00"));
    });

    it("returns no slots on a business-wide holiday", async () => {
      await prisma.scheduleException.create({
        data: {
          businessId,
          staffId: null,
          date: new Date(`${monday}T00:00:00.000Z`),
          type: "HOLIDAY",
        },
      });

      const response = await getAvailability(
        owner.token,
        `date=${monday}&serviceId=${serviceId}`
      );

      expect(response.status).toBe(200);
      expect(response.body.slots).toEqual([]);
    });

    it("applies business-wide special hours over the normal schedule", async () => {
      await prisma.scheduleException.create({
        data: {
          businessId,
          staffId: null,
          date: new Date(`${monday}T00:00:00.000Z`),
          type: "SPECIAL_HOURS",
          startTime: time(10),
          endTime: time(12),
        },
      });

      const response = await getAvailability(
        owner.token,
        `date=${monday}&serviceId=${serviceId}`
      );

      expect(slotStarts(response.body)).toEqual([
        at("10:00"),
        at("10:30"),
        at("11:00"),
        at("11:30"),
      ]);
    });

    it("evaluates working hours in the business timezone", async () => {
      await prisma.business.update({
        where: { id: businessId },
        data: { timezone: "America/New_York" },
      });

      const response = await getAvailability(
        owner.token,
        `date=${monday}&serviceId=${serviceId}&staffId=${staffOneMembershipId}`
      );

      expect(response.status).toBe(200);
      expect(response.body.timezone).toBe("America/New_York");
      expect(response.body.slots).toHaveLength(16);

      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      });
      expect(formatter.format(new Date(response.body.slots[0].startTime))).toBe("09:00");
    });

    it("returns no slots on a day the business is closed", async () => {
      const response = await getAvailability(
        owner.token,
        `date=${addDays(monday, 1)}&serviceId=${serviceId}`
      );

      expect(response.status).toBe(200);
      expect(response.body.slots).toEqual([]);
    });

    it("returns no slots when no active staff member provides the service", async () => {
      const unassigned = await prisma.service.create({
        data: {
          businessId,
          name: "Massage",
          durationMinutes: 60,
          price: "80.00",
        },
      });

      const response = await getAvailability(
        owner.token,
        `date=${monday}&serviceId=${unassigned.id}`
      );

      expect(response.status).toBe(200);
      expect(response.body.slots).toEqual([]);
    });

    it("validates the query, service and staff member", async () => {
      const badDate = await getAvailability(
        owner.token,
        `date=not-a-date&serviceId=${serviceId}`
      );
      expect(badDate.status).toBe(400);

      const foreignService = await prisma.service.create({
        data: {
          businessId: await createBusiness(owner.token, "Sch Salon Two", "sch-salon-two"),
          name: "Foreign",
          durationMinutes: 30,
          price: "10.00",
        },
      });
      const notFound = await getAvailability(
        owner.token,
        `date=${monday}&serviceId=${foreignService.id}`
      );
      expect(notFound.status).toBe(404);

      await prisma.service.update({
        where: { id: serviceId },
        data: { status: "INACTIVE" },
      });
      const inactive = await getAvailability(
        owner.token,
        `date=${monday}&serviceId=${serviceId}`
      );
      expect(inactive.status).toBe(409);
      expect(inactive.body.error.code).toBe("CONFLICT");
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

      const response = await getAvailability(
        owner.token,
        `date=${monday}&serviceId=${otherService.id}&staffId=${staffOneMembershipId}`
      );

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("CONFLICT");
    });

    it("returns 404 for a staff member from another business", async () => {
      const secondBusinessId = await createBusiness(
        owner.token,
        "Sch Salon Two",
        "sch-salon-two"
      );
      const foreignStaff = await prisma.businessMembership.create({
        data: {
          userId: staffTwo.userId,
          businessId: secondBusinessId,
          role: "STAFF",
          status: "ACTIVE",
        },
      });

      const response = await getAvailability(
        owner.token,
        `date=${monday}&serviceId=${serviceId}&staffId=${foreignStaff.id}`
      );

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("NOT_FOUND");
    });

    it("returns 403 when a non-member asks for availability", async () => {
      const response = await getAvailability(
        outsider.token,
        `date=${monday}&serviceId=${serviceId}`
      );

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("FORBIDDEN");
    });
  });
});
