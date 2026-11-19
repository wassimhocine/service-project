import bcrypt from "bcryptjs";
import jwt, { type SignOptions } from "jsonwebtoken";
import { config } from "../../config/index.js";
import { AppError } from "../../errors/index.js";
import { prisma } from "../../infrastructure/prisma.js";
import type { LoginInput, RegisterInput, UpdateProfileInput } from "./auth.schemas.js";

const publicUserSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

function signToken(userId: string, email: string): string {
  const options: SignOptions = {
    expiresIn: config.jwt.expiresIn as SignOptions["expiresIn"],
  };
  return jwt.sign({ userId, email }, config.jwt.secret, options);
}

export async function register(input: RegisterInput) {
  const email = input.email.toLowerCase();

  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    throw new AppError("Email is already registered", 409, "CONFLICT");
  }

  const passwordHash = await bcrypt.hash(input.password, 10);

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
    },
    select: publicUserSelect,
  });

  const token = signToken(user.id, user.email);

  return { user, token };
}

export async function login(input: LoginInput) {
  const email = input.email.toLowerCase();

  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    throw new AppError("Invalid email or password", 401, "UNAUTHORIZED");
  }

  if (user.status === "SUSPENDED") {
    throw new AppError("Account has been suspended", 403, "FORBIDDEN");
  }

  const isPasswordValid = await bcrypt.compare(input.password, user.passwordHash);

  if (!isPasswordValid) {
    throw new AppError("Invalid email or password", 401, "UNAUTHORIZED");
  }

  const token = signToken(user.id, user.email);

  return {
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    },
    token,
  };
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: publicUserSelect,
  });

  if (!user) {
    throw new AppError("Authenticated user no longer exists", 401, "UNAUTHORIZED");
  }

  if (user.status === "SUSPENDED") {
    throw new AppError("Account has been suspended", 403, "FORBIDDEN");
  }

  return user;
}

export async function updateMe(userId: string, input: UpdateProfileInput) {
  await getMe(userId);

  return prisma.user.update({
    where: { id: userId },
    data: {
      ...(input.firstName !== undefined && { firstName: input.firstName }),
      ...(input.lastName !== undefined && { lastName: input.lastName }),
      ...(input.phone !== undefined && { phone: input.phone }),
    },
    select: publicUserSelect,
  });
}
