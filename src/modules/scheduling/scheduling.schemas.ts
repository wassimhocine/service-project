import { z } from "zod";
import { isValidDateKey } from "./scheduling.domain.js";

const timeOfDay = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must be in HH:MM format");

const dateKey = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
  .refine(isValidDateKey, "Invalid date");

const workingHoursEntrySchema = z
  .object({
    dayOfWeek: z
      .number()
      .int()
      .min(0, "Day of week must be between 0 and 6")
      .max(6, "Day of week must be between 0 and 6"),
    startTime: timeOfDay.optional(),
    endTime: timeOfDay.optional(),
    isClosed: z.boolean().default(false),
  })
  .refine(
    (entry) =>
      entry.isClosed ||
      (entry.startTime !== undefined &&
        entry.endTime !== undefined &&
        entry.startTime < entry.endTime),
    {
      message: "Start and end time are required and start must be before end",
      path: ["endTime"],
    }
  );

export const updateWorkingHoursSchema = z.object({
  schedule: z
    .array(workingHoursEntrySchema)
    .max(7, "A weekly schedule can contain at most 7 entries")
    .refine(
      (entries) => new Set(entries.map((entry) => entry.dayOfWeek)).size === entries.length,
      { message: "Each day of the week can only appear once" }
    ),
});

export type UpdateWorkingHoursInput = z.infer<typeof updateWorkingHoursSchema>;

export const createExceptionSchema = z
  .object({
    staffId: z.string().uuid("Invalid staff ID").nullable().optional(),
    date: dateKey,
    type: z.enum(["TIME_OFF", "SPECIAL_HOURS", "HOLIDAY"]),
    startTime: timeOfDay.optional(),
    endTime: timeOfDay.optional(),
    reason: z.string().trim().max(500).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type === "SPECIAL_HOURS") {
      if (data.startTime === undefined || data.endTime === undefined) {
        ctx.addIssue({
          code: "custom",
          message: "Special hours require both a start and an end time",
          path: ["startTime"],
        });
        return;
      }
      if (data.startTime >= data.endTime) {
        ctx.addIssue({
          code: "custom",
          message: "Start time must be before end time",
          path: ["endTime"],
        });
      }
      return;
    }

    if ((data.startTime === undefined) !== (data.endTime === undefined)) {
      ctx.addIssue({
        code: "custom",
        message: "Provide both a start and an end time, or neither for a full day",
        path: ["endTime"],
      });
      return;
    }

    if (
      data.startTime !== undefined &&
      data.endTime !== undefined &&
      data.startTime >= data.endTime
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Start time must be before end time",
        path: ["endTime"],
      });
    }
  });

export type CreateExceptionInput = z.infer<typeof createExceptionSchema>;

export const listExceptionsQuerySchema = z
  .object({
    from: dateKey.optional(),
    to: dateKey.optional(),
    staffId: z.string().uuid("Invalid staff ID").optional(),
    type: z.enum(["TIME_OFF", "SPECIAL_HOURS", "HOLIDAY"]).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .refine(
    (data) => data.from === undefined || data.to === undefined || data.from <= data.to,
    {
      message: "from must be before or equal to to",
      path: ["to"],
    }
  );

export type ListExceptionsQueryInput = z.infer<typeof listExceptionsQuerySchema>;

export const availabilityQuerySchema = z.object({
  date: dateKey,
  serviceId: z.string().uuid("Invalid service ID"),
  staffId: z.string().uuid("Invalid staff ID").optional(),
});

export type AvailabilityQueryInput = z.infer<typeof availabilityQuerySchema>;
