import { z } from "zod";

const isoDateTime = z.iso.datetime({ offset: true });
const appointmentStatus = z.enum([
  "PENDING",
  "CONFIRMED",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
]);

export const createAppointmentSchema = z.object({
  customerId: z.string().uuid("Invalid customer ID").optional(),
  serviceId: z.string().uuid("Invalid service ID"),
  staffId: z.string().uuid("Invalid staff ID").optional(),
  startTime: isoDateTime,
  notes: z.string().trim().max(2000).optional(),
});

export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;

export const updateAppointmentSchema = z
  .object({
    notes: z.string().trim().max(2000).nullable().optional(),
    status: appointmentStatus.optional(),
  })
  .refine((data) => data.notes !== undefined || data.status !== undefined, {
    message: "At least one field must be provided for update",
  });

export type UpdateAppointmentInput = z.infer<typeof updateAppointmentSchema>;

export const listAppointmentsQuerySchema = z
  .object({
    from: isoDateTime.optional(),
    to: isoDateTime.optional(),
    staffId: z.string().uuid("Invalid staff ID").optional(),
    customerId: z.string().uuid("Invalid customer ID").optional(),
    status: appointmentStatus.optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .refine(
    (data) =>
      data.from === undefined ||
      data.to === undefined ||
      new Date(data.from) <= new Date(data.to),
    {
      message: "from must be before or equal to to",
      path: ["to"],
    }
  );

export type ListAppointmentsQueryInput = z.infer<typeof listAppointmentsQuerySchema>;

export const rescheduleAppointmentSchema = z.object({
  startTime: isoDateTime,
});

export type RescheduleAppointmentInput = z.infer<typeof rescheduleAppointmentSchema>;
