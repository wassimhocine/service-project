import { Prisma } from "@prisma/client";
import type { AppointmentStatus } from "@prisma/client";
import { AppError } from "../../errors/index.js";
import { prisma } from "../../infrastructure/prisma.js";
import { assertWithinSchedule } from "../scheduling/scheduling.domain.js";
import type {
  CreateAppointmentInput,
  ListAppointmentsQueryInput,
  RescheduleAppointmentInput,
  UpdateAppointmentInput,
} from "./appointments.schemas.js";

const appointmentInclude = {
  customer: {
    select: {
      id: true,
      userId: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
    },
  },
  staff: {
    select: {
      id: true,
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    },
  },
  service: {
    select: {
      id: true,
      name: true,
      durationMinutes: true,
      price: true,
    },
  },
} satisfies Prisma.AppointmentInclude;

const ALLOWED_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["COMPLETED", "CANCELLED", "NO_SHOW"],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

type Actor =
  | { kind: "manager"; membershipId: string }
  | { kind: "staff"; membershipId: string }
  | { kind: "customer"; userId: string };

async function resolveActor(userId: string, businessId: string): Promise<Actor> {
  const membership = await prisma.businessMembership.findUnique({
    where: {
      userId_businessId: { userId, businessId },
    },
  });

  if (membership) {
    if (membership.status !== "ACTIVE") {
      throw new AppError("You do not have access to this business", 403, "FORBIDDEN");
    }

    return membership.role === "STAFF"
      ? { kind: "staff", membershipId: membership.id }
      : { kind: "manager", membershipId: membership.id };
  }

  return { kind: "customer", userId };
}

async function assertNoOverlap(
  tx: Prisma.TransactionClient,
  businessId: string,
  staffId: string,
  startTime: Date,
  endTime: Date,
  excludeAppointmentId?: string
): Promise<void> {
  const conflicting = await tx.appointment.findFirst({
    where: {
      businessId,
      staffId,
      status: { in: ["PENDING", "CONFIRMED"] },
      startTime: { lt: endTime },
      endTime: { gt: startTime },
      ...(excludeAppointmentId !== undefined && { NOT: { id: excludeAppointmentId } }),
    },
    select: { id: true },
  });

  if (conflicting) {
    throw new AppError(
      "The staff member already has an appointment at this time",
      409,
      "CONFLICT"
    );
  }
}

async function runBookingTransaction<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  try {
    return await prisma.$transaction(fn, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034") {
      throw new AppError("The selected time slot is no longer available", 409, "CONFLICT");
    }
    throw err;
  }
}

async function validateBookingStaff(
  tx: Prisma.TransactionClient,
  businessId: string,
  staffId: string,
  serviceId: string
) {
  const staff = await tx.businessMembership.findUnique({
    where: { id: staffId },
  });

  if (!staff || staff.businessId !== businessId) {
    throw new AppError("Staff member not found in this business", 404, "NOT_FOUND");
  }

  if (staff.role !== "STAFF") {
    throw new AppError("The selected staff member cannot provide services", 409, "CONFLICT");
  }

  if (staff.status !== "ACTIVE") {
    throw new AppError("The selected staff member is not active", 409, "CONFLICT");
  }

  const assignment = await tx.staffService.findUnique({
    where: {
      staffId_serviceId: { staffId, serviceId },
    },
  });

  if (!assignment) {
    throw new AppError(
      "The selected staff member does not provide this service",
      409,
      "CONFLICT"
    );
  }

  return staff;
}

async function resolveCustomerForUser(
  tx: Prisma.TransactionClient,
  businessId: string,
  userId: string
) {
  const user = await tx.user.findUnique({ where: { id: userId } });

  if (!user) {
    throw new AppError("Authenticated user no longer exists", 401, "UNAUTHORIZED");
  }

  const existing = await tx.customer.findFirst({
    where: {
      businessId,
      OR: [{ userId }, { email: user.email }],
    },
    orderBy: { createdAt: "asc" },
  });

  if (existing) {
    if (existing.userId === null) {
      return tx.customer.update({
        where: { id: existing.id },
        data: { userId },
      });
    }

    if (existing.userId === userId) {
      return existing;
    }
  }

  if (!user.phone) {
    throw new AppError(
      "A phone number is required before booking an appointment",
      400,
      "BAD_REQUEST"
    );
  }

  return tx.customer.create({
    data: {
      businessId,
      userId,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email.toLowerCase(),
      phone: user.phone,
    },
  });
}

async function resolveCustomerId(
  tx: Prisma.TransactionClient,
  businessId: string,
  actor: Actor,
  inputCustomerId: string | undefined
): Promise<string> {
  if (actor.kind === "customer") {
    if (inputCustomerId) {
      const customer = await tx.customer.findUnique({
        where: { id: inputCustomerId },
      });

      if (!customer || customer.businessId !== businessId) {
        throw new AppError("Customer not found in this business", 404, "NOT_FOUND");
      }

      if (customer.userId !== actor.userId) {
        throw new AppError("You cannot book appointments for another customer", 403, "FORBIDDEN");
      }

      return customer.id;
    }

    const customer = await resolveCustomerForUser(tx, businessId, actor.userId);
    return customer.id;
  }

  if (!inputCustomerId) {
    throw new AppError(
      "customerId is required when booking on behalf of a customer",
      400,
      "BAD_REQUEST"
    );
  }

  const customer = await tx.customer.findUnique({
    where: { id: inputCustomerId },
  });

  if (!customer || customer.businessId !== businessId) {
    throw new AppError("Customer not found in this business", 404, "NOT_FOUND");
  }

  return customer.id;
}

async function selectStaffId(
  tx: Prisma.TransactionClient,
  businessId: string,
  timeZone: string,
  actor: Actor,
  requestedStaffId: string | undefined,
  serviceId: string,
  startTime: Date,
  endTime: Date
): Promise<string> {
  if (actor.kind === "staff") {
    if (requestedStaffId && requestedStaffId !== actor.membershipId) {
      throw new AppError(
        "Staff members can only create appointments for themselves",
        403,
        "FORBIDDEN"
      );
    }

    await validateBookingStaff(tx, businessId, actor.membershipId, serviceId);
    await assertWithinSchedule(tx, businessId, timeZone, actor.membershipId, startTime, endTime);
    await assertNoOverlap(tx, businessId, actor.membershipId, startTime, endTime);

    return actor.membershipId;
  }

  if (requestedStaffId) {
    await validateBookingStaff(tx, businessId, requestedStaffId, serviceId);
    await assertWithinSchedule(tx, businessId, timeZone, requestedStaffId, startTime, endTime);
    await assertNoOverlap(tx, businessId, requestedStaffId, startTime, endTime);

    return requestedStaffId;
  }

  const candidates = await tx.businessMembership.findMany({
    where: {
      businessId,
      role: "STAFF",
      status: "ACTIVE",
      staffServices: { some: { serviceId } },
    },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  if (candidates.length === 0) {
    throw new AppError("No active staff member provides this service", 409, "CONFLICT");
  }

  let lastError: AppError | undefined;

  for (const candidate of candidates) {
    try {
      await assertWithinSchedule(tx, businessId, timeZone, candidate.id, startTime, endTime);
      await assertNoOverlap(tx, businessId, candidate.id, startTime, endTime);
      return candidate.id;
    } catch (err) {
      if (err instanceof AppError) {
        lastError = err;
        continue;
      }
      throw err;
    }
  }

  throw (
    lastError ??
    new AppError("No staff member is available at the requested time", 409, "CONFLICT")
  );
}

async function findAccessibleAppointment(
  actor: Actor,
  businessId: string,
  appointmentId: string
) {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: appointmentInclude,
  });

  if (!appointment || appointment.businessId !== businessId) {
    throw new AppError("Appointment not found in this business", 404, "NOT_FOUND");
  }

  if (actor.kind === "staff" && appointment.staffId !== actor.membershipId) {
    throw new AppError("Appointment not found in this business", 404, "NOT_FOUND");
  }

  if (actor.kind === "customer" && appointment.customer.userId !== actor.userId) {
    throw new AppError("Appointment not found in this business", 404, "NOT_FOUND");
  }

  return appointment;
}

function assertStatusTransition(from: AppointmentStatus, to: AppointmentStatus): void {
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new AppError(
      `Cannot change appointment status from ${from} to ${to}`,
      409,
      "CONFLICT"
    );
  }
}

export async function createAppointment(
  userId: string,
  businessId: string,
  input: CreateAppointmentInput
) {
  const actor = await resolveActor(userId, businessId);

  return runBookingTransaction(async (tx) => {
    const business = await tx.business.findUnique({ where: { id: businessId } });

    if (!business) {
      throw new AppError("Business not found", 404, "NOT_FOUND");
    }

    if (business.status !== "ACTIVE") {
      throw new AppError("This business is not accepting appointments", 409, "CONFLICT");
    }

    const service = await tx.service.findUnique({ where: { id: input.serviceId } });

    if (!service || service.businessId !== businessId) {
      throw new AppError("Service not found in this business", 404, "NOT_FOUND");
    }

    if (service.status !== "ACTIVE") {
      throw new AppError("This service is not available for booking", 409, "CONFLICT");
    }

    const startTime = new Date(input.startTime);

    if (startTime.getTime() <= Date.now()) {
      throw new AppError("Appointments must be scheduled in the future", 409, "CONFLICT");
    }

    const endTime = new Date(startTime.getTime() + service.durationMinutes * 60_000);

    const customerId = await resolveCustomerId(tx, businessId, actor, input.customerId);
    const staffId = await selectStaffId(
      tx,
      businessId,
      business.timezone,
      actor,
      input.staffId,
      service.id,
      startTime,
      endTime
    );

    return tx.appointment.create({
      data: {
        businessId,
        customerId,
        staffId,
        serviceId: service.id,
        startTime,
        endTime,
        durationMinutes: service.durationMinutes,
        price: service.price,
        status: "PENDING",
        notes: input.notes,
      },
      include: appointmentInclude,
    });
  });
}

export async function listAppointments(
  userId: string,
  businessId: string,
  query: ListAppointmentsQueryInput
) {
  const actor = await resolveActor(userId, businessId);

  const where: Prisma.AppointmentWhereInput = { businessId };

  if (actor.kind === "staff") {
    where.staffId = actor.membershipId;
  }

  if (actor.kind === "customer") {
    where.customer = { is: { userId: actor.userId } };
  }

  if (query.status !== undefined) {
    where.status = query.status;
  }

  if (query.staffId !== undefined && actor.kind !== "staff") {
    where.staffId = query.staffId;
  }

  if (query.customerId !== undefined && actor.kind !== "customer") {
    where.customerId = query.customerId;
  }

  if (query.from !== undefined || query.to !== undefined) {
    where.startTime = {
      ...(query.from !== undefined && { gte: new Date(query.from) }),
      ...(query.to !== undefined && { lt: new Date(query.to) }),
    };
  }

  const skip = (query.page - 1) * query.limit;

  const [total, data] = await Promise.all([
    prisma.appointment.count({ where }),
    prisma.appointment.findMany({
      where,
      skip,
      take: query.limit,
      orderBy: { startTime: "asc" },
      include: appointmentInclude,
    }),
  ]);

  return {
    data,
    pagination: {
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(total / query.limit),
    },
  };
}

export async function getAppointment(
  userId: string,
  businessId: string,
  appointmentId: string
) {
  const actor = await resolveActor(userId, businessId);

  return findAccessibleAppointment(actor, businessId, appointmentId);
}

export async function updateAppointment(
  userId: string,
  businessId: string,
  appointmentId: string,
  input: UpdateAppointmentInput
) {
  const actor = await resolveActor(userId, businessId);

  if (actor.kind === "customer") {
    throw new AppError(
      "Customers cannot update appointment details",
      403,
      "FORBIDDEN"
    );
  }

  const appointment = await findAccessibleAppointment(actor, businessId, appointmentId);

  if (input.status !== undefined && input.status !== appointment.status) {
    assertStatusTransition(appointment.status, input.status);
  }

  return prisma.appointment.update({
    where: { id: appointment.id },
    data: {
      ...(input.notes !== undefined && { notes: input.notes }),
      ...(input.status !== undefined &&
        input.status !== appointment.status && {
          status: input.status,
          ...(input.status === "CANCELLED" && { cancelledAt: new Date() }),
          ...(input.status === "COMPLETED" && { completedAt: new Date() }),
        }),
    },
    include: appointmentInclude,
  });
}

export async function cancelAppointment(
  userId: string,
  businessId: string,
  appointmentId: string
) {
  const actor = await resolveActor(userId, businessId);
  const appointment = await findAccessibleAppointment(actor, businessId, appointmentId);

  assertStatusTransition(appointment.status, "CANCELLED");

  if (actor.kind === "customer" && appointment.startTime <= new Date()) {
    throw new AppError(
      "Appointments can no longer be cancelled after they have started",
      409,
      "CONFLICT"
    );
  }

  return prisma.appointment.update({
    where: { id: appointment.id },
    data: { status: "CANCELLED", cancelledAt: new Date() },
    include: appointmentInclude,
  });
}

export async function rescheduleAppointment(
  userId: string,
  businessId: string,
  appointmentId: string,
  input: RescheduleAppointmentInput
) {
  const actor = await resolveActor(userId, businessId);
  const appointment = await findAccessibleAppointment(actor, businessId, appointmentId);

  if (appointment.status !== "PENDING" && appointment.status !== "CONFIRMED") {
    throw new AppError(
      "Only pending or confirmed appointments can be rescheduled",
      409,
      "CONFLICT"
    );
  }

  if (actor.kind === "customer" && appointment.startTime <= new Date()) {
    throw new AppError(
      "Appointments can no longer be rescheduled after they have started",
      409,
      "CONFLICT"
    );
  }

  const startTime = new Date(input.startTime);

  if (startTime.getTime() <= Date.now()) {
    throw new AppError("Appointments must be scheduled in the future", 409, "CONFLICT");
  }

  const endTime = new Date(startTime.getTime() + appointment.durationMinutes * 60_000);

  return runBookingTransaction(async (tx) => {
    const business = await tx.business.findUnique({ where: { id: businessId } });

    if (!business || business.status !== "ACTIVE") {
      throw new AppError("This business is not accepting appointments", 409, "CONFLICT");
    }

    await validateBookingStaff(tx, businessId, appointment.staffId, appointment.serviceId);
    await assertWithinSchedule(
      tx,
      businessId,
      business.timezone,
      appointment.staffId,
      startTime,
      endTime
    );
    await assertNoOverlap(
      tx,
      businessId,
      appointment.staffId,
      startTime,
      endTime,
      appointment.id
    );

    return tx.appointment.update({
      where: { id: appointment.id },
      data: { startTime, endTime },
      include: appointmentInclude,
    });
  });
}

export async function completeAppointment(
  userId: string,
  businessId: string,
  appointmentId: string
) {
  const actor = await resolveActor(userId, businessId);

  if (actor.kind === "customer") {
    throw new AppError("Customers cannot complete appointments", 403, "FORBIDDEN");
  }

  const appointment = await findAccessibleAppointment(actor, businessId, appointmentId);

  assertStatusTransition(appointment.status, "COMPLETED");

  return prisma.appointment.update({
    where: { id: appointment.id },
    data: { status: "COMPLETED", completedAt: new Date() },
    include: appointmentInclude,
  });
}

export async function markNoShow(
  userId: string,
  businessId: string,
  appointmentId: string
) {
  const actor = await resolveActor(userId, businessId);

  if (actor.kind === "customer") {
    throw new AppError("Customers cannot mark appointments as no-show", 403, "FORBIDDEN");
  }

  const appointment = await findAccessibleAppointment(actor, businessId, appointmentId);

  assertStatusTransition(appointment.status, "NO_SHOW");

  return prisma.appointment.update({
    where: { id: appointment.id },
    data: { status: "NO_SHOW" },
    include: appointmentInclude,
  });
}
