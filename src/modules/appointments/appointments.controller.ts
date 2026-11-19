import type { Request, Response } from "express";
import * as appointmentsService from "./appointments.service.js";

export async function create(req: Request, res: Response): Promise<void> {
  const result = await appointmentsService.createAppointment(
    req.user!.id,
    req.params.id as string,
    req.body
  );
  res.status(201).json(result);
}

export async function list(req: Request, res: Response): Promise<void> {
  const result = await appointmentsService.listAppointments(
    req.user!.id,
    req.params.id as string,
    req.query as any
  );
  res.status(200).json(result);
}

export async function get(req: Request, res: Response): Promise<void> {
  const result = await appointmentsService.getAppointment(
    req.user!.id,
    req.params.id as string,
    req.params.appointmentId as string
  );
  res.status(200).json(result);
}

export async function update(req: Request, res: Response): Promise<void> {
  const result = await appointmentsService.updateAppointment(
    req.user!.id,
    req.params.id as string,
    req.params.appointmentId as string,
    req.body
  );
  res.status(200).json(result);
}

export async function cancel(req: Request, res: Response): Promise<void> {
  const result = await appointmentsService.cancelAppointment(
    req.user!.id,
    req.params.id as string,
    req.params.appointmentId as string
  );
  res.status(200).json(result);
}

export async function reschedule(req: Request, res: Response): Promise<void> {
  const result = await appointmentsService.rescheduleAppointment(
    req.user!.id,
    req.params.id as string,
    req.params.appointmentId as string,
    req.body
  );
  res.status(200).json(result);
}

export async function complete(req: Request, res: Response): Promise<void> {
  const result = await appointmentsService.completeAppointment(
    req.user!.id,
    req.params.id as string,
    req.params.appointmentId as string
  );
  res.status(200).json(result);
}

export async function noShow(req: Request, res: Response): Promise<void> {
  const result = await appointmentsService.markNoShow(
    req.user!.id,
    req.params.id as string,
    req.params.appointmentId as string
  );
  res.status(200).json(result);
}
