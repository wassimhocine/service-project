import type { Request, Response } from "express";
import * as authService from "./auth.service.js";

export async function register(req: Request, res: Response): Promise<void> {
  const result = await authService.register(req.body);
  res.status(201).json(result);
}

export async function login(req: Request, res: Response): Promise<void> {
  const result = await authService.login(req.body);
  res.status(200).json(result);
}

export async function logout(_req: Request, res: Response): Promise<void> {
  res.status(200).json({ message: "Logged out successfully" });
}

export async function me(req: Request, res: Response): Promise<void> {
  const result = await authService.getMe(req.user!.id);
  res.status(200).json(result);
}

export async function updateMe(req: Request, res: Response): Promise<void> {
  const result = await authService.updateMe(req.user!.id, req.body);
  res.status(200).json(result);
}
