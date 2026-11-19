import type { Prisma } from "@prisma/client";
import { AppError } from "../../errors/index.js";
import { prisma } from "../../infrastructure/prisma.js";
import { verifyManagementAccess, verifyMemberAccess } from "../../utils/tenant-access.js";
import type {
  CreateCustomerInput,
  ListCustomersQueryInput,
  UpdateCustomerInput,
} from "./customers.schemas.js";

export async function createCustomer(
  userId: string,
  businessId: string,
  input: CreateCustomerInput
) {
  await verifyManagementAccess(
    userId,
    businessId,
    "Only owners and managers can manage customers"
  );

  const email = input.email.toLowerCase();

  const existingCustomer = await prisma.customer.findFirst({
    where: {
      businessId,
      email,
    },
  });

  if (existingCustomer) {
    throw new AppError("A customer with this email already exists in this business", 409, "CONFLICT");
  }

  let linkedUserId = input.userId;
  if (!linkedUserId) {
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });
    if (existingUser) {
      linkedUserId = existingUser.id;
    }
  }

  return prisma.customer.create({
    data: {
      businessId,
      userId: linkedUserId,
      firstName: input.firstName,
      lastName: input.lastName,
      email,
      phone: input.phone,
      notes: input.notes,
    },
  });
}

export async function listCustomers(
  userId: string,
  businessId: string,
  query: ListCustomersQueryInput
) {
  await verifyMemberAccess(userId, businessId);

  const where: Prisma.CustomerWhereInput = { businessId };

  if (query.search) {
    const s = query.search;
    where.OR = [
      { firstName: { contains: s, mode: "insensitive" } },
      { lastName: { contains: s, mode: "insensitive" } },
      { email: { contains: s, mode: "insensitive" } },
      { phone: { contains: s } },
    ];
  }

  const skip = (query.page - 1) * query.limit;

  const [total, data] = await Promise.all([
    prisma.customer.count({ where }),
    prisma.customer.findMany({
      where,
      skip,
      take: query.limit,
      orderBy: { createdAt: "desc" },
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

export async function getCustomer(
  userId: string,
  businessId: string,
  customerId: string
) {
  await verifyMemberAccess(userId, businessId);

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
        },
      },
    },
  });

  if (!customer || customer.businessId !== businessId) {
    throw new AppError("Customer not found in this business", 404, "NOT_FOUND");
  }

  return customer;
}

export async function updateCustomer(
  userId: string,
  businessId: string,
  customerId: string,
  input: UpdateCustomerInput
) {
  await verifyManagementAccess(
    userId,
    businessId,
    "Only owners and managers can manage customers"
  );

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
  });

  if (!customer || customer.businessId !== businessId) {
    throw new AppError("Customer not found in this business", 404, "NOT_FOUND");
  }

  if (input.email) {
    const email = input.email.toLowerCase();
    const existing = await prisma.customer.findFirst({
      where: {
        businessId,
        email,
        NOT: { id: customerId },
      },
    });

    if (existing) {
      throw new AppError("A customer with this email already exists in this business", 409, "CONFLICT");
    }
  }

  return prisma.customer.update({
    where: { id: customerId },
    data: {
      ...(input.firstName !== undefined && { firstName: input.firstName }),
      ...(input.lastName !== undefined && { lastName: input.lastName }),
      ...(input.email !== undefined && { email: input.email.toLowerCase() }),
      ...(input.phone !== undefined && { phone: input.phone }),
      ...(input.notes !== undefined && { notes: input.notes }),
      ...(input.userId !== undefined && { userId: input.userId }),
    },
  });
}
