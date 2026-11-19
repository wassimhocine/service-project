import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { validateBody, validateQuery } from "../../middleware/validate.js";
import * as appointmentsController from "./appointments.controller.js";
import {
  createAppointmentSchema,
  listAppointmentsQuerySchema,
  rescheduleAppointmentSchema,
  updateAppointmentSchema,
} from "./appointments.schemas.js";

export const appointmentsRouter = Router({ mergeParams: true });

appointmentsRouter.use(authenticate);

appointmentsRouter.post(
  "/",
  validateBody(createAppointmentSchema),
  appointmentsController.create
);
appointmentsRouter.get(
  "/",
  validateQuery(listAppointmentsQuerySchema),
  appointmentsController.list
);
appointmentsRouter.get("/:appointmentId", appointmentsController.get);
appointmentsRouter.patch(
  "/:appointmentId",
  validateBody(updateAppointmentSchema),
  appointmentsController.update
);
appointmentsRouter.post("/:appointmentId/cancel", appointmentsController.cancel);
appointmentsRouter.post(
  "/:appointmentId/reschedule",
  validateBody(rescheduleAppointmentSchema),
  appointmentsController.reschedule
);
appointmentsRouter.post("/:appointmentId/complete", appointmentsController.complete);
appointmentsRouter.post("/:appointmentId/no-show", appointmentsController.noShow);
