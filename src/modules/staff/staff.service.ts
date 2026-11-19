import type { Prisma } from "@prisma/client";
import { AppError } from "../../errors/index.js";
import { prisma } from "../../infrastructure/prisma.js";
import { verifyManagementAccess, verifyMemberAccess } from "../../utils/tenant-access.js";
import type {
  AddStaffInput,
  AssignServicesInput,
  ListStaffQueryInput,
  UpdateScheduleInput,
  UpdateStaffInput,
} from "./staff.schemas.js";

const staffInclude = {
  user: {
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      phone: true,
      status: true,
    },
  },
  staffServices: {
    include: {
      service: {
        select: {
          id: true,
          name: true,
          durationMinutes: true,
          price: true,
          status: true,
        },
      },
    },
  },
  workingHours: {
    orderBy: { dayOfWeek: "asc" },
  },
} satisfies Prisma.BusinessMembershipInclude;

type StaffRecord = Prisma.BusinessMembershipGetPayload<{ include: typeof staffInclude }>;

function formatTime(value: Date | null): string | null {
  return value ? value.toISOString().slice(11, 16) : null;
}

function serializeStaff(staff: StaffRecord) {
  return {
    ...staff,
    workingHours: staff.workingHours.map((entry) => ({
      id: entry.id,
      staffId: entry.staffId,
      dayOfWeek: entry.dayOfWeek,
      startTime: entry.isOff ? null : formatTime(entry.startTime),
      endTime: entry.isOff ? null : formatTime(entry.endTime),
      isOff: entry.isOff,
    })),
  };
}

async function findStaffOrThrow(businessId: string, staffId: string) {
  const staff = await prisma.businessMembership.findUnique({
    where: { id: staffId },
    include: staffInclude,
  });

  if (!staff || staff.businessId !== businessId || staff.role !== "STAFF") {
    throw new AppError("Staff member not found in this business", 404, "NOT_FOUND");
  }

  return staff;
}

function toTimeDate(time: string): Date {
  const [hours, minutes] = time.split(":").map(Number);
  return new Date(Date.UTC(1970, 0, 1, hours, minutes, 0, 0));
}

export async function createStaff(
  userId: string,
  businessId: string,
  input: AddStaffInput
) {
  await verifyManagementAccess(
    userId,
    businessId,
    "Only owners and managers can manage staff"
  );

  const email = input.email.toLowerCase();

  const targetUser = await prisma.user.findUnique({
    where: { email },
  });

  if (!targetUser) {
    throw new AppError("No user found with the provided email", 404, "NOT_FOUND");
  }

  const existingMembership = await prisma.businessMembership.findUnique({
    where: {
      userId_businessId: {
        userId: targetUser.id,
        businessId,
      },
    },
  });

  if (existingMembership) {
    throw new AppError("User is already a member of this business", 409, "CONFLICT");
  }

  const created = await prisma.businessMembership.create({
    data: {
      userId: targetUser.id,
      businessId,
      role: "STAFF",
      status: input.status,
    },
    include: staffInclude,
  });

  return serializeStaff(created);
}

export async function listStaff(
  userId: string,
  businessId: string,
  query: ListStaffQueryInput
) {
  await verifyMemberAccess(userId, businessId);

  const where: Prisma.BusinessMembershipWhereInput = {
    businessId,
    role: "STAFF",
    ...(query.status !== undefined && { status: query.status }),
  };

  if (query.search) {
    const s = query.search;
    where.user = {
      is: {
        OR: [
          { firstName: { contains: s, mode: "insensitive" } },
          { lastName: { contains: s, mode: "insensitive" } },
          { email: { contains: s, mode: "insensitive" } },
          { phone: { contains: s } },
        ],
      },
    };
  }

  const skip = (query.page - 1) * query.limit;

  const [total, data] = await Promise.all([
    prisma.businessMembership.count({ where }),
    prisma.businessMembership.findMany({
      where,
      skip,
      take: query.limit,
      orderBy: { createdAt: "desc" },
      include: staffInclude,
    }),
  ]);

  return {
    data: data.map(serializeStaff),
    pagination: {
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(total / query.limit),
    },
  };
}

export async function getStaff(
  userId: string,
  businessId: string,
  staffId: string
) {
  await verifyMemberAccess(userId, businessId);

  const staff = await findStaffOrThrow(businessId, staffId);
  return serializeStaff(staff);
}

export async function updateStaff(
  userId: string,
  businessId: string,
  staffId: string,
  input: UpdateStaffInput
) {
  await verifyManagementAccess(
    userId,
    businessId,
    "Only owners and managers can manage staff"
  );

  await findStaffOrThrow(businessId, staffId);

  const updated = await prisma.businessMembership.update({
    where: { id: staffId },
    data: {
      status: input.status,
    },
    include: staffInclude,
  });

  return serializeStaff(updated);
}

export async function assignServices(
  userId: string,
  businessId: string,
  staffId: string,
  input: AssignServicesInput
) {
  await verifyManagementAccess(
    userId,
    businessId,
    "Only owners and managers can manage staff"
  );

  const staff = await findStaffOrThrow(businessId, staffId);
  const serviceIds = [...new Set(input.serviceIds)];

  if (serviceIds.length > 0) {
    const serviceCount = await prisma.service.count({
      where: {
        id: { in: serviceIds },
        businessId,
      },
    });

    if (serviceCount !== serviceIds.length) {
      throw new AppError("One or more services do not belong to this business", 400, "BAD_REQUEST");
    }
  }

  await prisma.$transaction([
    prisma.staffService.deleteMany({ where: { staffId: staff.id } }),
    ...(serviceIds.length > 0
      ? [
          prisma.staffService.createMany({
            data: serviceIds.map((serviceId) => ({
              staffId: staff.id,
              serviceId,
            })),
          }),
        ]
      : []),
  ]);

  const updated = await findStaffOrThrow(businessId, staffId);
  return serializeStaff(updated);
}

export async function updateSchedule(
  userId: string,
  businessId: string,
  staffId: string,
  input: UpdateScheduleInput
) {
  await verifyManagementAccess(
    userId,
    businessId,
    "Only owners and managers can manage staff"
  );

  const staff = await findStaffOrThrow(businessId, staffId);

  await prisma.$transaction([
    prisma.staffWorkingHours.deleteMany({ where: { staffId: staff.id } }),
    ...(input.schedule.length > 0
      ? [
          prisma.staffWorkingHours.createMany({
            data: input.schedule.map((entry) => ({
              staffId: staff.id,
              dayOfWeek: entry.dayOfWeek,
              startTime:
                entry.isOff || !entry.startTime ? null : toTimeDate(entry.startTime),
              endTime:
                entry.isOff || !entry.endTime ? null : toTimeDate(entry.endTime),
              isOff: entry.isOff,
            })),
          }),
        ]
      : []),
  ]);

  const updated = await findStaffOrThrow(businessId, staffId);
  return serializeStaff(updated);
}
