import type { BusinessWorkingHours, Prisma, ScheduleException } from "@prisma/client";
import { AppError } from "../../errors/index.js";
import { prisma } from "../../infrastructure/prisma.js";
import {
  findBusinessOrThrow,
  findStaffMembershipOrThrow,
  verifyManagementAccess,
  verifyMemberAccess,
} from "../../utils/tenant-access.js";
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
  };
}

function resolveDayBounds(dateKey: string, timeZone: string): { dayStart: Date; dayEnd: Date } {
  try {
    const dayStart = zonedDateTimeToUtc(dateKey, 0, timeZone);
    const dayEnd = zonedDateTimeToUtc(addDaysToDateKey(dateKey, 1), 0, timeZone);
    // Validate the timezone eagerly so an invalid value fails with a clear error.
    getZonedParts(dayStart, timeZone);
    return { dayStart, dayEnd };
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
  await verifyManagementAccess(
    userId,
    businessId,
    "Only owners and managers can manage the business schedule"
  );

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
      orderBy: [{ date: "asc" }, { startTime: "asc" }, { id: "asc" }],
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
  await verifyManagementAccess(
    userId,
    businessId,
    "Only owners and managers can manage the business schedule"
  );
  await findBusinessOrThrow(businessId);

  const staffId = input.staffId ?? null;

  if (input.type === "TIME_OFF" && staffId === null) {
    throw new AppError(
      "Time off must be assigned to a staff member",
      400,
      "BAD_REQUEST"
    );
  }

  if (input.type === "HOLIDAY" && staffId !== null) {
    throw new AppError(
      "Holidays are business-wide; use TIME_OFF for individual staff members",
      400,
      "BAD_REQUEST"
    );
  }

  if (staffId !== null) {
    await findStaffMembershipOrThrow(businessId, staffId);
  }

  const date = dateKeyToUtcDate(input.date);

  if (input.type === "HOLIDAY" || input.type === "SPECIAL_HOURS") {
    const duplicate = await prisma.scheduleException.findFirst({
      where: {
        businessId,
        staffId,
        date,
        type: input.type,
      },
    });

    if (duplicate) {
      throw new AppError(
        `A ${input.type} exception already exists for this date`,
        409,
        "CONFLICT"
      );
    }
  }

  const exception = await prisma.scheduleException.create({
    data: {
      businessId,
      staffId,
      date,
      type: input.type,
      startTime: input.startTime ? timeStringToDate(input.startTime) : null,
      endTime: input.endTime ? timeStringToDate(input.endTime) : null,
      reason: input.reason,
    },
  });

  return serializeException(exception);
}

export async function deleteException(
  userId: string,
  businessId: string,
  exceptionId: string
) {
  await verifyManagementAccess(
    userId,
    businessId,
    "Only owners and managers can manage the business schedule"
  );

  const exception = await prisma.scheduleException.findUnique({
    where: { id: exceptionId },
  });

  if (!exception || exception.businessId !== businessId) {
    throw new AppError("Schedule exception not found in this business", 404, "NOT_FOUND");
  }

  await prisma.scheduleException.delete({ where: { id: exceptionId } });

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

  if (business.status !== "ACTIVE") {
    throw new AppError("This business is not accepting appointments", 409, "CONFLICT");
  }

  const service = await prisma.service.findUnique({ where: { id: query.serviceId } });

  if (!service || service.businessId !== businessId) {
    throw new AppError("Service not found in this business", 404, "NOT_FOUND");
  }

  if (service.status !== "ACTIVE") {
    throw new AppError("This service is not available for booking", 409, "CONFLICT");
  }

  let staffIds: string[] = [];

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

  const { dayStart, dayEnd } = resolveDayBounds(query.date, business.timezone);

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
