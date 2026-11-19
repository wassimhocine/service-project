import { AppError } from "../errors/index.js";
import { prisma } from "../infrastructure/prisma.js";

export async function verifyMemberAccess(userId: string, businessId: string) {
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

export async function verifyManagementAccess(
  userId: string,
  businessId: string,
  message = "Only owners and managers can perform this action"
) {
  const caller = await verifyMemberAccess(userId, businessId);

  if (caller.role === "STAFF") {
    throw new AppError(message, 403, "FORBIDDEN");
  }

  return caller;
}

export async function findBusinessOrThrow(businessId: string) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
  });

  if (!business) {
    throw new AppError("Business not found", 404, "NOT_FOUND");
  }

  return business;
}

export async function findStaffMembershipOrThrow(businessId: string, staffId: string) {
  const staff = await prisma.businessMembership.findUnique({
    where: { id: staffId },
  });

  if (!staff || staff.businessId !== businessId || staff.role !== "STAFF") {
    throw new AppError("Staff member not found in this business", 404, "NOT_FOUND");
  }

  return staff;
}
