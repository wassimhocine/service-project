import type { Request, Response } from "express";
import * as servicesRouteService from "./services.service.js";

export async function create(req: Request, res: Response): Promise<void> {
  const result = await servicesRouteService.createService(
    req.user!.id,
    req.params.id as string,
    req.body
  );
  res.status(201).json(result);
}

export async function list(req: Request, res: Response): Promise<void> {
  const result = await servicesRouteService.listServices(
    req.user!.id,
    req.params.id as string,
    req.query as any
  );
  res.status(200).json(result);
}

export async function get(req: Request, res: Response): Promise<void> {
  const result = await servicesRouteService.getService(
    req.user!.id,
    req.params.id as string,
    req.params.serviceId as string
  );
  res.status(200).json(result);
}

export async function update(req: Request, res: Response): Promise<void> {
  const result = await servicesRouteService.updateService(
    req.user!.id,
    req.params.id as string,
    req.params.serviceId as string,
    req.body
  );
  res.status(200).json(result);
}

export async function deactivate(req: Request, res: Response): Promise<void> {
  const result = await servicesRouteService.deactivateService(
    req.user!.id,
    req.params.id as string,
    req.params.serviceId as string
  );
  res.status(200).json(result);
}
