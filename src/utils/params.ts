import { z } from "zod";

export function uuidParams<T extends string>(...keys: T[]) {
  const shape = Object.fromEntries(
    keys.map((key) => [key, z.string().uuid(`Invalid ${key}`)])
  ) as Record<T, z.ZodString>;

  return z.object(shape);
}
