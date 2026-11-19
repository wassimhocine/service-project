import type { BusinessWorkingHours, Prisma, ScheduleException } from "@prisma/client";
import { AppError } from "../../errors/index.js";
import { prisma } from "../../infrastructure/prisma.js";
import {
  addDaysToDateKey,
  dateKeyToUtcDate,
  getZonedParts,
  isBlocked,
  resolveDaySchedule,
  timeStringToDate,
  zonedDateTimeToUtc,
  type DaySchedule,
} from "./scheduling.domain.js";
import type {
  AvailabilityQueryInput,
  CreateExceptionInput,
  ListExceptionsQueryInput,
  UpdateWorkingHoursInput,
} from "./scheduling.schemas.js";

const DEFAULT_WEEK = [0, 1, 2, 3, 4, 5, 6];

const BUSINESS_DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

type NormalizedWorkingHours = {
  dayOfWeek: number;
  day: string;
  startTime: string | null;
  endTime: string | null;
  isClosed: boolean;
};

async function verifyMemberAccess(userId: string, businessId: string) {
  const caller = await prisma.businessMembership.findUnique({
    where: {
      userId_businessId: { userId, businessId },
    },
  });

  if (!caller || caller.status !== "ACTIVE") {
    throw new AppError("You do not have access to this business", 403, "FORBIDDEN");
  }

  return caller;
}

async function verifyManagementAccess(userId: string, businessId: string) {
  const caller = await verifyMemberAccess(userId, businessId);

  if (caller.role === "STAFF") {
    throw new AppError(
      "Only owners and managers can manage the business schedule",
      403,
      "FORBIDDEN"
    );
  }

  return caller;
}

async function findBusinessOrThrow(businessId: string) {
  const business = await prisma.business.findUnique({ where: { id: businessId } });

  if (!business) {
    throw new AppError("Business not found", 404, "NOT_FOUND");
  }

  return business;
}

async function findStaffOrThrow(businessId: string, staffId: string) {
  const staff = await prisma.businessMembership.findUnique({
    where: { id: staffId },
  });

  if (!staff || staff.businessId !== businessId || staff.role !== "STAFF") {
    throw new AppError("Staff member not found in this business", 404, "NOT_FOUND");
  }

  return staff;
}

function formatTime(value: Date | null): string | null {
  return value ? value.toISOString().slice(11, 16) : null;
}

function normalizeWorkingHours(rows: BusinessWorkingHours[]): NormalizedWorkingHours[] {
  return DEFAULT_WEEK.map((dayOfWeek) => {
    const row = rows.find((entry) => entry.dayOfWeek === dayOfWeek);
    const isClosed = !row || row.isClosed || !row.startTime || !row.endTime;

    return {
      dayOfWeek,
      day: BUSINESS_DAY_NAMES[dayOfWeek],
      startTime: isClosed ? null : formatTime(row.startTime),
      endTime: isClosed ? null : formatTime(row.endTime),
      isClosed,
    };
  });
}

function serializeException(exception: ScheduleException) {
  return {
    id: exception.id,
    businessId: exception.businessId,
    staffId: exception.staffId,
    date: exception.date.toISOString().slice(0, 10),
    type: exception.type,
    startTime: formatTime(exception.startTime),
    endTime: formatTime(exception.endTime),
    reason: exception.reason,
    createdAt: exception.createdAt,
  };
}

export async function getWorkingHours(userId: string, businessId: string) {
  await verifyMemberAccess(userId, businessId);

  const business = await findBusinessOrThrow(businessId);
  const rows = await prisma.businessWorkingHours.findMany({
    where: { businessId },
    orderBy: { dayOfWeek: "asc" },
  });

  return {
    timezone: business.timezone,
    schedule: normalizeWorkingHours(rows),
  };
}

export async function updateWorkingHours(
  userId: string,
  businessId: string,
  input: UpdateWorkingHoursInput
) {
  await verifyManagementAccess(userId, businessId);

  const business = await findBusinessOrThrow(businessId);

  const rows = await prisma.$transaction(async (tx) => {
    await tx.businessWorkingHours.deleteMany({ where: { businessId } });

    if (input.schedule.length > 0) {
      await tx.businessWorkingHours.createMany({
        data: input.schedule.map((entry) => ({
          businessId,
          dayOfWeek: entry.dayOfWeek,
          startTime:
            entry.isClosed || !entry.startTime ? null : timeStringToDate(entry.startTime),
          endTime: entry.isClosed || !entry.endTime ? null : timeStringToDate(entry.endTime),
          isClosed: entry.isClosed,
        })),
      });
    }

    return tx.businessWorkingHours.findMany({
      where: { businessId },
      orderBy: { dayOfWeek: "asc" },
    });
  });

  return {
    timezone: business.timezone,
    schedule: normalizeWorkingHours(rows),
  };
}

export async function listExceptions(
  userId: string,
  businessId: string,
  query: ListExceptionsQueryInput
) {
  await verifyMemberAccess(userId, businessId);

  const where: Prisma.ScheduleExceptionWhereInput = { businessId };

  if (query.staffId !== undefined) {
    where.staffId = query.staffId;
  }

  if (query.type !== undefined) {
    where.type = query.type;
  }

  if (query.from !== undefined || query.to !== undefined) {
    where.date = {
      ...(query.from !== undefined && { gte: dateKeyToUtcDate(query.from) }),
      ...(query.to !== undefined && { lte: dateKeyToUtcDate(query.to) }),
    };
  }

  const skip = (query.page - 1) * query.limit;

  const [total, data] = await Promise.all([
    prisma.scheduleException.count({ where }),
    prisma.scheduleException.findMany({
      where,
      skip,
      take: query.limit,
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    }),
  ]);

  return {
    data: data.map(serializeException),
    pagination: {
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(total / query.limit),
    },
  };
}

export async function createException(
  userId: string,
  businessId: string,
  input: CreateExceptionInput
) {
  await verifyManagementAccess(userId, businessId);
  await findBusinessOrThrow(businessId);

  const staffId = input.staffId ?? null;

  if (input.type === "TIME_OFF" && staffId === null) {
    throw new AppError(
      "Time off must be assigned to a staff member",
      400,
      "BAD_REQUEST"
    );
  }

  if (staffId !== null) {
    await findStaffOrThrow(businessId, staffId);
  }

  const exception = await prisma.scheduleException.create({
    data: {
      businessId,
      staffId,
      date: dateKeyToUtcDate(input.date),
      type: input.type,
      startTime: input.startTime ? timeStringToDate(input.startTime) : null,
      endTime: input.endTime ? timeStringToDate(input.endTime) : null,
      reason: input.reason,
    },
  });

  return serializeException(exception);
}

type Slot = { start: number; end: number };

function generateSlots(schedule: DaySchedule, durationMinutes: number): Slot[] {
  if (schedule.closed || !schedule.businessWindow || !schedule.staffWindow) {
    return [];
  }

  const windowStart = Math.max(schedule.businessWindow.start, schedule.staffWindow.start);
  const windowEnd = Math.min(schedule.businessWindow.end, schedule.staffWindow.end);

  const slots: Slot[] = [];

  for (
    let start = windowStart;
    start + durationMinutes <= windowEnd;
    start += durationMinutes
  ) {
    const end = start + durationMinutes;

    if (isBlocked(schedule, start, end)) {
      continue;
    }

    slots.push({ start, end });
  }

  return slots;
}

export async function getAvailability(
  userId: string,
  businessId: string,
  query: AvailabilityQueryInput
) {
  await verifyMemberAccess(userId, businessId);

  const business = await findBusinessOrThrow(businessId);

  const service = await prisma.service.findUnique({ where: { id: query.serviceId } });

  if (!service || service.businessId !== businessId) {
    throw new AppError("Service not found in this business", 404, "NOT_FOUND");
  }

  if (service.status !== "ACTIVE") {
    throw new AppError("This service is not available for booking", 409, "CONFLICT");
  }

  let staffIds: string[];

  if (query.staffId !== undefined) {
    const staff = await prisma.businessMembership.findUnique({
      where: { id: query.staffId },
    });

    if (!staff || staff.businessId !== businessId) {
      throw new AppError("Staff member not found in this business", 404, "NOT_FOUND");
    }

    if (staff.role !== "STAFF" || staff.status !== "ACTIVE") {
      throw new AppError(
        "The selected staff member cannot provide services",
        409,
        "CONFLICT"
      );
    }

    const assignment = await prisma.staffService.findUnique({
      where: {
        staffId_serviceId: { staffId: staff.id, serviceId: service.id },
      },
    });

    if (!assignment) {
      throw new AppError(
        "The selected staff member does not provide this service",
        409,
        "CONFLICT"
      );
    }

    staffIds = [staff.id];
  } else {
    const staff = await prisma.businessMembership.findMany({
      where: {
        businessId,
        role: "STAFF",
        status: "ACTIVE",
        staffServices: { some: { serviceId: service.id } },
      },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });

    staffIds = staff.map((entry) => entry.id);
  }

  let dayStart: Date;
  let dayEnd: Date;

  try {
    dayStart = zonedDateTimeToUtc(query.date, 0, business.timezone);
    dayEnd = zonedDateTimeToUtc(
      addDaysToDateKey(query.date, 1),
      0,
      business.timezone
    );
    // Validate the timezone eagerly so an invalid value fails with a clear error.
    getZonedParts(dayStart, business.timezone);
  } catch (error) {
    if (error instanceof RangeError) {
      throw new AppError(
        "The business timezone is not configured correctly",
        500,
        "INTERNAL_SERVER_ERROR"
      );
    }
    throw error;
  }

  if (staffIds.length === 0) {
    return {
      date: query.date,
      timezone: business.timezone,
      service: {
        id: service.id,
        name: service.name,
        durationMinutes: service.durationMinutes,
        price: service.price,
      },
      slots: [],
    };
  }

  const busyAppointments = await prisma.appointment.findMany({
    where: {
      businessId,
      staffId: { in: staffIds },
      status: { in: ["PENDING", "CONFIRMED"] },
      startTime: { lt: dayEnd },
      endTime: { gt: dayStart },
    },
    select: { staffId: true, startTime: true, endTime: true },
  });

  const now = Date.now();

  const slotsByStart = new Map<
    string,
    { startTime: string; endTime: string; staffIds: Set<string> }
  >();

  for (const staffId of staffIds) {
    const schedule = await resolveDaySchedule(prisma, businessId, staffId, query.date);
    const slots = generateSlots(schedule, service.durationMinutes);
    const staffBusy = busyAppointments.filter(
      (appointment) => appointment.staffId === staffId
    );

    for (const slot of slots) {
      const slotStart = zonedDateTimeToUtc(query.date, slot.start, business.timezone);
      const slotEnd = zonedDateTimeToUtc(query.date, slot.end, business.timezone);

      if (slotStart.getTime() <= now) {
        continue;
      }

      const overlaps = staffBusy.some(
        (appointment) =>
          slotStart < appointment.endTime && slotEnd > appointment.startTime
      );

      if (overlaps) {
        continue;
      }

      const key = slotStart.toISOString();
      const existing = slotsByStart.get(key);

      if (existing) {
        existing.staffIds.add(staffId);
      } else {
        slotsByStart.set(key, {
          startTime: key,
          endTime: slotEnd.toISOString(),
          staffIds: new Set([staffId]),
        });
      }
    }
  }

  const slots = [...slotsByStart.values()]
    .sort((left, right) => left.startTime.localeCompare(right.startTime))
    .map((slot) => ({
      startTime: slot.startTime,
      endTime: slot.endTime,
      staffIds: [...slot.staffIds],
    }));

  return {
    date: query.date,
    timezone: business.timezone,
    service: {
      id: service.id,
      name: service.name,
      durationMinutes: service.durationMinutes,
      price: service.price,
    },
    ...(query.staffId !== undefined && { staffId: query.staffId }),
    slots,
  };
}
