import type { Request, Response } from "express";
import * as businessesService from "./businesses.service.js";

export async function create(req: Request, res: Response): Promise<void> {
  const result = await businessesService.createBusiness(req.user!.id, req.body);
  res.status(201).json(result);
}

export async function get(req: Request, res: Response): Promise<void> {
  const result = await businessesService.getBusiness(req.user!.id, req.params.id as string);
  res.status(200).json(result);
}

export async function listMine(req: Request, res: Response): Promise<void> {
  const result = await businessesService.listUserBusinesses(req.user!.id);
  res.status(200).json(result);
}

export async function update(req: Request, res: Response): Promise<void> {
  const result = await businessesService.updateBusiness(req.user!.id, req.params.id as string, req.body);
  res.status(200).json(result);
}

export async function listMembers(req: Request, res: Response): Promise<void> {
  const result = await businessesService.listMembers(req.user!.id, req.params.id as string);
  res.status(200).json(result);
}

export async function addMember(req: Request, res: Response): Promise<void> {
  const result = await businessesService.addMember(req.user!.id, req.params.id as string, req.body);
  res.status(201).json(result);
}

export async function updateMember(req: Request, res: Response): Promise<void> {
  const result = await businessesService.updateMember(
    req.user!.id,
    req.params.id as string,
    req.params.memberId as string,
    req.body
  );
  res.status(200).json(result);
}
