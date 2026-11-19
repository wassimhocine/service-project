import type { Prisma } from "@prisma/client";
import { AppError } from "../../errors/index.js";
import { prisma } from "../../infrastructure/prisma.js";
import type {
  CreateServiceInput,
  ListServicesQueryInput,
  UpdateServiceInput,
} from "./services.schemas.js";

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
    throw new AppError("Only owners and managers can manage services", 403, "FORBIDDEN");
  }

  return caller;
}

async function findServiceOrThrow(businessId: string, serviceId: string) {
  const service = await prisma.service.findUnique({
    where: { id: serviceId },
  });

  if (!service || service.businessId !== businessId) {
    throw new AppError("Service not found in this business", 404, "NOT_FOUND");
  }

  return service;
}

export async function createService(
  userId: string,
  businessId: string,
  input: CreateServiceInput
) {
  await verifyManagementAccess(userId, businessId);

  return prisma.service.create({
    data: {
      businessId,
      name: input.name,
      description: input.description,
      durationMinutes: input.durationMinutes,
      price: input.price,
      status: input.status,
    },
  });
}

export async function listServices(
  userId: string,
  businessId: string,
  query: ListServicesQueryInput
) {
  await verifyMemberAccess(userId, businessId);

  const where: Prisma.ServiceWhereInput = { businessId };

  if (query.status !== undefined) {
    where.status = query.status;
  }

  if (query.search) {
    const search = query.search;
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
    ];
  }

  const skip = (query.page - 1) * query.limit;

  const [total, data] = await Promise.all([
    prisma.service.count({ where }),
    prisma.service.findMany({
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

export async function getService(
  userId: string,
  businessId: string,
  serviceId: string
) {
  await verifyMemberAccess(userId, businessId);

  return findServiceOrThrow(businessId, serviceId);
}

export async function updateService(
  userId: string,
  businessId: string,
  serviceId: string,
  input: UpdateServiceInput
) {
  await verifyManagementAccess(userId, businessId);
  await findServiceOrThrow(businessId, serviceId);

  return prisma.service.update({
    where: { id: serviceId },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.durationMinutes !== undefined && {
        durationMinutes: input.durationMinutes,
      }),
      ...(input.price !== undefined && { price: input.price }),
      ...(input.status !== undefined && { status: input.status }),
    },
  });
}

export async function deactivateService(
  userId: string,
  businessId: string,
  serviceId: string
) {
  await verifyManagementAccess(userId, businessId);

  const service = await findServiceOrThrow(businessId, serviceId);

  if (service.status === "INACTIVE") {
    return service;
  }

  return prisma.service.update({
    where: { id: serviceId },
    data: { status: "INACTIVE" },
  });
}
