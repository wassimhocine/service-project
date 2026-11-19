import { Router } from "express";
import { validateBody, validateParams, validateQuery } from "../../middleware/index.js";
import { uuidParams } from "../../utils/params.js";
import * as appointmentsController from "./appointments.controller.js";
import {
  createAppointmentSchema,
  listAppointmentsQuerySchema,
  rescheduleAppointmentSchema,
  updateAppointmentSchema,
} from "./appointments.schemas.js";

export const appointmentsRouter = Router({ mergeParams: true });

const appointmentIdParams = validateParams(uuidParams("id", "appointmentId"));

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
appointmentsRouter.get("/:appointmentId", appointmentIdParams, appointmentsController.get);
appointmentsRouter.patch(
  "/:appointmentId",
  appointmentIdParams,
  validateBody(updateAppointmentSchema),
  appointmentsController.update
);
appointmentsRouter.post(
  "/:appointmentId/cancel",
  appointmentIdParams,
  appointmentsController.cancel
);
appointmentsRouter.post(
  "/:appointmentId/reschedule",
  appointmentIdParams,
  validateBody(rescheduleAppointmentSchema),
  appointmentsController.reschedule
);
appointmentsRouter.post(
  "/:appointmentId/complete",
  appointmentIdParams,
  appointmentsController.complete
);
appointmentsRouter.post(
  "/:appointmentId/no-show",
  appointmentIdParams,
  appointmentsController.noShow
);
