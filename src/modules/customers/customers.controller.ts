import type { Request, Response } from "express";
import * as customersService from "./customers.service.js";

export async function create(req: Request, res: Response): Promise<void> {
  const result = await customersService.createCustomer(
    req.user!.id,
    req.params.id as string,
    req.body
  );
  res.status(201).json(result);
}

export async function list(req: Request, res: Response): Promise<void> {
  const result = await customersService.listCustomers(
    req.user!.id,
    req.params.id as string,
    req.query as any
  );
  res.status(200).json(result);
}

export async function get(req: Request, res: Response): Promise<void> {
  const result = await customersService.getCustomer(
    req.user!.id,
    req.params.id as string,
    req.params.customerId as string
  );
  res.status(200).json(result);
}

export async function update(req: Request, res: Response): Promise<void> {
  const result = await customersService.updateCustomer(
    req.user!.id,
    req.params.id as string,
    req.params.customerId as string,
    req.body
  );
  res.status(200).json(result);
}
