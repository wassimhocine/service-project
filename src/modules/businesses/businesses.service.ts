import { AppError } from "../../errors/index.js";
import { prisma } from "../../infrastructure/prisma.js";
import type {
  AddMemberInput,
  CreateBusinessInput,
  UpdateBusinessInput,
  UpdateMemberInput,
} from "./businesses.schemas.js";

function generateSlug(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || `biz-${Date.now()}`;
}

export async function createBusiness(userId: string, input: CreateBusinessInput) {
  const slug = input.slug ? input.slug.toLowerCase().trim() : generateSlug(input.name);

  const existingSlug = await prisma.business.findUnique({
    where: { slug },
  });

  if (existingSlug) {
    throw new AppError("Business slug is already taken", 409, "CONFLICT");
  }

  // Atomically create the business and assign the creator as the initial OWNER
  const result = await prisma.$transaction(async (tx) => {
    const business = await tx.business.create({
      data: {
        name: input.name,
        slug,
        description: input.description,
        email: input.email.toLowerCase(),
        phone: input.phone,
        address: input.address,
        timezone: input.timezone ?? "UTC",
        currency: input.currency ?? "USD",
        status: "ACTIVE",
      },
    });

    const membership = await tx.businessMembership.create({
      data: {
        userId,
        businessId: business.id,
        role: "OWNER",
        status: "ACTIVE",
      },
    });

    return { business, membership };
  });

  return {
    ...result.business,
    myRole: result.membership.role,
  };
}

export async function getBusiness(userId: string, businessId: string) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
  });

  if (!business) {
    throw new AppError("Business not found", 404, "NOT_FOUND");
  }

  const membership = await prisma.businessMembership.findUnique({
    where: {
      userId_businessId: { userId, businessId },
    },
  });

  if (!membership || membership.status !== "ACTIVE") {
    throw new AppError("You do not have access to this business", 403, "FORBIDDEN");
  }

  return {
    ...business,
    myRole: membership.role,
  };
}

export async function listUserBusinesses(userId: string) {
  const memberships = await prisma.businessMembership.findMany({
    where: {
      userId,
      status: "ACTIVE",
    },
    include: {
      business: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return memberships.map((m) => ({
    ...m.business,
    myRole: m.role,
  }));
}

export async function updateBusiness(userId: string, businessId: string, input: UpdateBusinessInput) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
  });

  if (!business) {
    throw new AppError("Business not found", 404, "NOT_FOUND");
  }

  const membership = await prisma.businessMembership.findUnique({
    where: {
      userId_businessId: { userId, businessId },
    },
  });

  if (!membership || membership.status !== "ACTIVE" || membership.role !== "OWNER") {
    throw new AppError("Only business owners can update business settings", 403, "FORBIDDEN");
  }

  if (input.slug) {
    const existing = await prisma.business.findFirst({
      where: {
        slug: input.slug.toLowerCase(),
        NOT: { id: businessId },
      },
    });

    if (existing) {
      throw new AppError("Business slug is already taken", 409, "CONFLICT");
    }
  }

  return prisma.business.update({
    where: { id: businessId },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.slug !== undefined && { slug: input.slug.toLowerCase() }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.email !== undefined && { email: input.email.toLowerCase() }),
      ...(input.phone !== undefined && { phone: input.phone }),
      ...(input.address !== undefined && { address: input.address }),
      ...(input.timezone !== undefined && { timezone: input.timezone }),
      ...(input.currency !== undefined && { currency: input.currency }),
      ...(input.status !== undefined && { status: input.status }),
    },
  });
}

export async function listMembers(userId: string, businessId: string) {
  const caller = await prisma.businessMembership.findUnique({
    where: {
      userId_businessId: { userId, businessId },
    },
  });

  if (!caller || caller.status !== "ACTIVE") {
    throw new AppError("You do not have access to this business", 403, "FORBIDDEN");
  }

  return prisma.businessMembership.findMany({
    where: { businessId },
    include: {
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
    },
    orderBy: {
      createdAt: "asc",
    },
  });
}

export async function addMember(userId: string, businessId: string, input: AddMemberInput) {
  const caller = await prisma.businessMembership.findUnique({
    where: {
      userId_businessId: { userId, businessId },
    },
  });

  if (!caller || caller.status !== "ACTIVE" || caller.role === "STAFF") {
    throw new AppError("Only owners and managers can add members", 403, "FORBIDDEN");
  }

  if (caller.role === "MANAGER" && input.role === "OWNER") {
    throw new AppError("Managers cannot assign the OWNER role", 403, "FORBIDDEN");
  }

  const targetUser = await prisma.user.findUnique({
    where: { email: input.email.toLowerCase() },
  });

  if (!targetUser) {
    throw new AppError("No user found with the provided email", 404, "NOT_FOUND");
  }

  const existingMember = await prisma.businessMembership.findUnique({
    where: {
      userId_businessId: {
        userId: targetUser.id,
        businessId,
      },
    },
  });

  if (existingMember) {
    throw new AppError("User is already a member of this business", 409, "CONFLICT");
  }

  return prisma.businessMembership.create({
    data: {
      userId: targetUser.id,
      businessId,
      role: input.role,
      status: input.status,
    },
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
}

export async function updateMember(
  userId: string,
  businessId: string,
  memberId: string,
  input: UpdateMemberInput
) {
  const caller = await prisma.businessMembership.findUnique({
    where: {
      userId_businessId: { userId, businessId },
    },
  });

  if (!caller || caller.status !== "ACTIVE" || caller.role === "STAFF") {
    throw new AppError("Only owners and managers can update members", 403, "FORBIDDEN");
  }

  const target = await prisma.businessMembership.findUnique({
    where: { id: memberId },
  });

  if (!target || target.businessId !== businessId) {
    throw new AppError("Membership not found in this business", 404, "NOT_FOUND");
  }

  if (caller.role === "MANAGER") {
    if (target.role === "OWNER") {
      throw new AppError("Managers cannot modify an OWNER membership", 403, "FORBIDDEN");
    }
    if (input.role === "OWNER") {
      throw new AppError("Managers cannot promote members to OWNER", 403, "FORBIDDEN");
    }
  }

  // Prevent demoting or suspending the last active owner of the business
  const isDemotingOrSuspendingOwner =
    target.role === "OWNER" &&
    ((input.role && input.role !== "OWNER") || (input.status && input.status !== "ACTIVE"));

  if (isDemotingOrSuspendingOwner) {
    const activeOwnerCount = await prisma.businessMembership.count({
      where: {
        businessId,
        role: "OWNER",
        status: "ACTIVE",
      },
    });

    if (activeOwnerCount <= 1) {
      throw new AppError("Cannot demote or suspend the last active owner of the business", 400, "BAD_REQUEST");
    }
  }

  return prisma.businessMembership.update({
    where: { id: memberId },
    data: {
      ...(input.role !== undefined && { role: input.role }),
      ...(input.status !== undefined && { status: input.status }),
    },
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
}
