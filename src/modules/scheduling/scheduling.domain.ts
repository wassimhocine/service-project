import type { Prisma, PrismaClient } from "@prisma/client";
import { AppError } from "../../errors/index.js";

export type TimeWindow = { start: number; end: number };

export type DaySchedule = {
  closed: boolean;
  businessWindow: TimeWindow | null;
  staffWindow: TimeWindow | null;
  /** `null` means the whole day is blocked. */
  blockedRanges: (TimeWindow | null)[];
};

type PrismaLike = PrismaClient | Prisma.TransactionClient;

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function toMinutes(value: Date): number {
  return value.getUTCHours() * 60 + value.getUTCMinutes();
}

export function timeStringToDate(value: string): Date {
  const [hours, minutes] = value.split(":").map(Number);
  return new Date(Date.UTC(1970, 0, 1, hours, minutes, 0, 0));
}

export function dateKeyToUtcDate(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00.000Z`);
}

export function addDaysToDateKey(dateKey: string, days: number): string {
  const date = dateKeyToUtcDate(dateKey);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function isValidDateKey(value: string): boolean {
  const date = dateKeyToUtcDate(value);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function getZonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const hours = Number(values.hour);
  const minutes = Number(values.minute);

  return {
    dateKey: `${values.year}-${values.month}-${values.day}`,
    dayOfWeek: WEEKDAY_INDEX[values.weekday] ?? 0,
    minutes: hours * 60 + minutes,
  };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const asUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second)
  );
  const timestamp = Math.floor(date.getTime() / 1000) * 1000;

  return asUtc - timestamp;
}

/**
 * Converts a wall-clock time in the business timezone to a UTC instant.
 * Handles standard DST offsets by re-checking the offset once.
 */
export function zonedDateTimeToUtc(
  dateKey: string,
  minutes: number,
  timeZone: string
): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  const guess = Date.UTC(year, month - 1, day, hours, remainder, 0, 0);

  const firstOffset = getTimeZoneOffsetMs(new Date(guess), timeZone);
  let timestamp = guess - firstOffset;

  const secondOffset = getTimeZoneOffsetMs(new Date(timestamp), timeZone);
  if (secondOffset !== firstOffset) {
    timestamp = guess - secondOffset;
  }

  return new Date(timestamp);
}

export async function resolveDaySchedule(
  db: PrismaLike,
  businessId: string,
  staffId: string,
  dateKey: string
): Promise<DaySchedule> {
  const dayOfWeek = dateKeyToUtcDate(dateKey).getUTCDay();

  const exceptions = await db.scheduleException.findMany({
    where: {
      businessId,
      date: dateKeyToUtcDate(dateKey),
      OR: [{ staffId: null }, { staffId }],
    },
  });

  const businessHours = await db.businessWorkingHours.findUnique({
    where: {
      businessId_dayOfWeek: { businessId, dayOfWeek },
    },
  });
  const staffHours = await db.staffWorkingHours.findMany({
    where: { staffId },
  });

  const closed = exceptions.some(
    (exception) => exception.staffId === null && exception.type === "HOLIDAY"
  );

  let businessWindow: TimeWindow | null = null;
  const businessSpecial = exceptions.find(
    (exception) => exception.staffId === null && exception.type === "SPECIAL_HOURS"
  );

  if (businessSpecial) {
    if (businessSpecial.startTime && businessSpecial.endTime) {
      businessWindow = {
        start: toMinutes(businessSpecial.startTime),
        end: toMinutes(businessSpecial.endTime),
      };
    }
  } else if (
    businessHours &&
    !businessHours.isClosed &&
    businessHours.startTime &&
    businessHours.endTime
  ) {
    businessWindow = {
      start: toMinutes(businessHours.startTime),
      end: toMinutes(businessHours.endTime),
    };
  }

  let staffWindow: TimeWindow | null = null;
  const staffSpecial = exceptions.find(
    (exception) => exception.staffId === staffId && exception.type === "SPECIAL_HOURS"
  );

  if (staffSpecial) {
    if (staffSpecial.startTime && staffSpecial.endTime) {
      staffWindow = {
        start: toMinutes(staffSpecial.startTime),
        end: toMinutes(staffSpecial.endTime),
      };
    }
  } else if (staffHours.length === 0) {
    // A staff member without an explicit schedule inherits the business hours.
    staffWindow = businessWindow;
  } else {
    const today = staffHours.find((hours) => hours.dayOfWeek === dayOfWeek);
    if (today && !today.isOff && today.startTime && today.endTime) {
      staffWindow = {
        start: toMinutes(today.startTime),
        end: toMinutes(today.endTime),
      };
    }
  }

  const blockedRanges = exceptions
    .filter(
      (exception) =>
        exception.type === "TIME_OFF" ||
        (exception.type === "HOLIDAY" && exception.staffId === staffId)
    )
    .map((exception) =>
      exception.startTime && exception.endTime
        ? {
            start: toMinutes(exception.startTime),
            end: toMinutes(exception.endTime),
          }
        : null
    );

  return { closed, businessWindow, staffWindow, blockedRanges };
}

export function isBlocked(schedule: DaySchedule, start: number, end: number): boolean {
  return schedule.blockedRanges.some((range) =>
    range === null ? true : start < range.end && end > range.start
  );
}

export async function assertWithinSchedule(
  tx: Prisma.TransactionClient,
  businessId: string,
  timeZone: string,
  staffId: string,
  startTime: Date,
  endTime: Date
): Promise<void> {
  const start = getZonedParts(startTime, timeZone);
  const end = getZonedParts(endTime, timeZone);

  if (start.dateKey !== end.dateKey) {
    throw new AppError("Appointments cannot span more than one day", 409, "CONFLICT");
  }

  const schedule = await resolveDaySchedule(tx, businessId, staffId, start.dateKey);

  if (schedule.closed) {
    throw new AppError("The business is closed on the selected date", 409, "CONFLICT");
  }

  if (!schedule.businessWindow) {
    throw new AppError("The business is closed at the selected time", 409, "CONFLICT");
  }

  if (!schedule.staffWindow) {
    throw new AppError("The staff member is not working at the selected time", 409, "CONFLICT");
  }

  const windowStart = Math.max(schedule.businessWindow.start, schedule.staffWindow.start);
  const windowEnd = Math.min(schedule.businessWindow.end, schedule.staffWindow.end);

  if (start.minutes < windowStart || end.minutes > windowEnd) {
    throw new AppError("The appointment falls outside working hours", 409, "CONFLICT");
  }

  if (isBlocked(schedule, start.minutes, end.minutes)) {
    throw new AppError("The appointment overlaps a scheduled time off", 409, "CONFLICT");
  }
}
