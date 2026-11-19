import { z } from "zod";

export const createCustomerSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(100),
  lastName: z.string().trim().min(1, "Last name is required").max(100),
  email: z.string().trim().email("Invalid email address").max(320),
  phone: z.string().trim().min(1, "Phone number is required").max(30),
  notes: z.string().trim().optional(),
  userId: z.string().uuid("Invalid user ID").optional(),
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

export const updateCustomerSchema = z
  .object({
    firstName: z.string().trim().min(1).max(100).optional(),
    lastName: z.string().trim().min(1).max(100).optional(),
    email: z.string().trim().email().max(320).optional(),
    phone: z.string().trim().min(1).max(30).optional(),
    notes: z.string().trim().nullable().optional(),
    userId: z.string().uuid().nullable().optional(),
  })
  .refine(
    (data) =>
      data.firstName !== undefined ||
      data.lastName !== undefined ||
      data.email !== undefined ||
      data.phone !== undefined ||
      data.notes !== undefined ||
      data.userId !== undefined,
    {
      message: "At least one field must be provided for update",
    }
  );

export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

export const listCustomersQuerySchema = z.object({
  search: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListCustomersQueryInput = z.infer<typeof listCustomersQuerySchema>;
