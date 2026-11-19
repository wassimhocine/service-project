import { Router } from "express";
import { validateBody, validateParams, validateQuery } from "../../middleware/index.js";
import { uuidParams } from "../../utils/params.js";
import * as staffController from "./staff.controller.js";
import {
  addStaffSchema,
  assignServicesSchema,
  listStaffQuerySchema,
  updateScheduleSchema,
  updateStaffSchema,
} from "./staff.schemas.js";

export const staffRouter = Router({ mergeParams: true });

const staffIdParams = validateParams(uuidParams("id", "staffId"));

staffRouter.post("/", validateBody(addStaffSchema), staffController.create);
staffRouter.get("/", validateQuery(listStaffQuerySchema), staffController.list);
staffRouter.get("/:staffId", staffIdParams, staffController.get);
staffRouter.patch(
  "/:staffId",
  staffIdParams,
  validateBody(updateStaffSchema),
  staffController.update
);
staffRouter.put(
  "/:staffId/services",
  staffIdParams,
  validateBody(assignServicesSchema),
  staffController.assignServices
);
staffRouter.put(
  "/:staffId/schedule",
  staffIdParams,
  validateBody(updateScheduleSchema),
  staffController.updateSchedule
);
