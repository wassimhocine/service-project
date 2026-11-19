import type { Request, Response } from "express";
import * as schedulingService from "./scheduling.service.js";

export async function getWorkingHours(req: Request, res: Response): Promise<void> {
  const result = await schedulingService.getWorkingHours(
    req.user!.id,
    req.params.id as string
  );
  res.status(200).json(result);
}

export async function updateWorkingHours(req: Request, res: Response): Promise<void> {
  const result = await schedulingService.updateWorkingHours(
    req.user!.id,
    req.params.id as string,
    req.body
  );
  res.status(200).json(result);
}

export async function listExceptions(req: Request, res: Response): Promise<void> {
  const result = await schedulingService.listExceptions(
    req.user!.id,
    req.params.id as string,
    req.query as any
  );
  res.status(200).json(result);
}

export async function createException(req: Request, res: Response): Promise<void> {
  const result = await schedulingService.createException(
    req.user!.id,
    req.params.id as string,
    req.body
  );
  res.status(201).json(result);
}

export async function getAvailability(req: Request, res: Response): Promise<void> {
  const result = await schedulingService.getAvailability(
    req.user!.id,
    req.params.id as string,
    req.query as any
  );
  res.status(200).json(result);
}
