import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { validateBody, validateQuery } from "../../middleware/validate.js";
import * as schedulingController from "./scheduling.controller.js";
import {
  availabilityQuerySchema,
  createExceptionSchema,
  listExceptionsQuerySchema,
  updateWorkingHoursSchema,
} from "./scheduling.schemas.js";

export const schedulingRouter = Router({ mergeParams: true });

schedulingRouter.use(authenticate);

schedulingRouter.get("/working-hours", schedulingController.getWorkingHours);
schedulingRouter.put(
  "/working-hours",
  validateBody(updateWorkingHoursSchema),
  schedulingController.updateWorkingHours
);

schedulingRouter.get(
  "/exceptions",
  validateQuery(listExceptionsQuerySchema),
  schedulingController.listExceptions
);
schedulingRouter.post(
  "/exceptions",
  validateBody(createExceptionSchema),
  schedulingController.createException
);

schedulingRouter.get(
  "/availability",
  validateQuery(availabilityQuerySchema),
  schedulingController.getAvailability
);
