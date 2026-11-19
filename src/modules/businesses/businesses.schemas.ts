import { z } from "zod";

export const createBusinessSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  slug: z
    .string()
    .trim()
    .min(2, "Slug must be at least 2 characters")
    .max(120)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug can only contain lowercase alphanumeric characters and hyphens")
    .optional(),
  description: z.string().trim().optional(),
  email: z.string().trim().email("Invalid email address").max(320),
  phone: z.string().trim().min(1, "Phone number is required").max(30),
  address: z.string().trim().optional(),
  timezone: z.string().trim().max(64).optional(),
  currency: z.string().trim().length(3, "Currency must be 3 characters").optional(),
});

export type CreateBusinessInput = z.infer<typeof createBusinessSchema>;

export const updateBusinessSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(120)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug can only contain lowercase alphanumeric characters and hyphens")
    .optional(),
  description: z.string().trim().nullable().optional(),
  email: z.string().trim().email().max(320).optional(),
  phone: z.string().trim().min(1).max(30).optional(),
  address: z.string().trim().nullable().optional(),
  timezone: z.string().trim().max(64).optional(),
  currency: z.string().trim().length(3).optional(),
  status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
});

export type UpdateBusinessInput = z.infer<typeof updateBusinessSchema>;

export const addMemberSchema = z.object({
  email: z.string().trim().email("Invalid email address"),
  role: z.enum(["OWNER", "MANAGER", "STAFF"]).default("STAFF"),
  status: z.enum(["INVITED", "ACTIVE", "SUSPENDED"]).default("INVITED"),
});

export type AddMemberInput = z.infer<typeof addMemberSchema>;

export const updateMemberSchema = z
  .object({
    role: z.enum(["OWNER", "MANAGER", "STAFF"]).optional(),
    status: z.enum(["INVITED", "ACTIVE", "SUSPENDED"]).optional(),
  })
  .refine((data) => data.role !== undefined || data.status !== undefined, {
    message: "At least one of role or status must be provided",
  });

export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;
