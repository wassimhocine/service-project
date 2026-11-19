import { Router } from "express";
import { validateBody, validateParams, validateQuery } from "../../middleware/index.js";
import { uuidParams } from "../../utils/params.js";
import * as schedulingController from "./scheduling.controller.js";
import {
  availabilityQuerySchema,
  createExceptionSchema,
  listExceptionsQuerySchema,
  updateWorkingHoursSchema,
} from "./scheduling.schemas.js";

export const schedulingRouter = Router({ mergeParams: true });

const exceptionIdParams = validateParams(uuidParams("id", "exceptionId"));

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
schedulingRouter.delete(
  "/exceptions/:exceptionId",
  exceptionIdParams,
  schedulingController.deleteException
);

schedulingRouter.get(
  "/availability",
  validateQuery(availabilityQuerySchema),
  schedulingController.getAvailability
);
