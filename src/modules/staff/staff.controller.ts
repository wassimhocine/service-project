import type { Request, Response } from "express";
import * as staffService from "./staff.service.js";

export async function create(req: Request, res: Response): Promise<void> {
  const result = await staffService.createStaff(
    req.user!.id,
    req.params.id as string,
    req.body
  );
  res.status(201).json(result);
}

export async function list(req: Request, res: Response): Promise<void> {
  const result = await staffService.listStaff(
    req.user!.id,
    req.params.id as string,
    req.query as any
  );
  res.status(200).json(result);
}

export async function get(req: Request, res: Response): Promise<void> {
  const result = await staffService.getStaff(
    req.user!.id,
    req.params.id as string,
    req.params.staffId as string
  );
  res.status(200).json(result);
}

export async function update(req: Request, res: Response): Promise<void> {
  const result = await staffService.updateStaff(
    req.user!.id,
    req.params.id as string,
    req.params.staffId as string,
    req.body
  );
  res.status(200).json(result);
}

export async function assignServices(req: Request, res: Response): Promise<void> {
  const result = await staffService.assignServices(
    req.user!.id,
    req.params.id as string,
    req.params.staffId as string,
    req.body
  );
  res.status(200).json(result);
}

export async function updateSchedule(req: Request, res: Response): Promise<void> {
  const result = await staffService.updateSchedule(
    req.user!.id,
    req.params.id as string,
    req.params.staffId as string,
    req.body
  );
  res.status(200).json(result);
}
