import { z } from "zod";

const timeOfDay = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must be in HH:MM format");

export const addStaffSchema = z.object({
  email: z.string().trim().email("Invalid email address").max(320),
  status: z.enum(["INVITED", "ACTIVE"]).default("ACTIVE"),
});

export type AddStaffInput = z.infer<typeof addStaffSchema>;

export const updateStaffSchema = z.object({
  status: z.enum(["INVITED", "ACTIVE", "SUSPENDED"]),
});

export type UpdateStaffInput = z.infer<typeof updateStaffSchema>;

export const listStaffQuerySchema = z.object({
  search: z.string().trim().optional(),
  status: z.enum(["INVITED", "ACTIVE", "SUSPENDED"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListStaffQueryInput = z.infer<typeof listStaffQuerySchema>;

export const assignServicesSchema = z.object({
  serviceIds: z.array(z.string().uuid("Invalid service ID")).max(200),
});

export type AssignServicesInput = z.infer<typeof assignServicesSchema>;

const workingHoursEntrySchema = z
  .object({
    dayOfWeek: z.number().int().min(0, "Day of week must be between 0 and 6").max(6, "Day of week must be between 0 and 6"),
    startTime: timeOfDay.optional(),
    endTime: timeOfDay.optional(),
    isOff: z.boolean().default(false),
  })
  .refine(
    (entry) =>
      entry.isOff ||
      (entry.startTime !== undefined &&
        entry.endTime !== undefined &&
        entry.startTime < entry.endTime),
    {
      message: "Start and end time are required and start must be before end",
      path: ["endTime"],
    }
  );

export const updateScheduleSchema = z.object({
  schedule: z
    .array(workingHoursEntrySchema)
    .max(7, "A weekly schedule can contain at most 7 entries")
    .refine(
      (entries) => new Set(entries.map((entry) => entry.dayOfWeek)).size === entries.length,
      { message: "Each day of the week can only appear once" }
    ),
});

export type UpdateScheduleInput = z.infer<typeof updateScheduleSchema>;
