import { z } from "zod";

const price = z
  .union([z.string(), z.number()])
  .transform((value) => String(value))
  .refine((value) => /^\d+(\.\d{1,2})?$/.test(value), {
    message: "Price must be a positive amount with at most 2 decimal places",
  })
  .refine((value) => Number(value) > 0, {
    message: "Price must be greater than zero",
  });

export const createServiceSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  description: z.string().trim().optional(),
  durationMinutes: z
    .number()
    .int("Duration must be a whole number of minutes")
    .min(1, "Duration must be at least 1 minute")
    .max(1440, "Duration cannot exceed 24 hours"),
  price,
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
});

export type CreateServiceInput = z.infer<typeof createServiceSchema>;

export const updateServiceSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().nullable().optional(),
    durationMinutes: z.number().int().min(1).max(1440).optional(),
    price: price.optional(),
    status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  })
  .refine(
    (data) =>
      data.name !== undefined ||
      data.description !== undefined ||
      data.durationMinutes !== undefined ||
      data.price !== undefined ||
      data.status !== undefined,
    {
      message: "At least one field must be provided for update",
    }
  );

export type UpdateServiceInput = z.infer<typeof updateServiceSchema>;

export const listServicesQuerySchema = z.object({
  search: z.string().trim().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListServicesQueryInput = z.infer<typeof listServicesQuerySchema>;
