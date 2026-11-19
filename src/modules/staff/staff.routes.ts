import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { validateBody, validateQuery } from "../../middleware/validate.js";
import * as staffController from "./staff.controller.js";
import {
  addStaffSchema,
  assignServicesSchema,
  listStaffQuerySchema,
  updateScheduleSchema,
  updateStaffSchema,
} from "./staff.schemas.js";

export const staffRouter = Router({ mergeParams: true });

staffRouter.use(authenticate);

staffRouter.post("/", validateBody(addStaffSchema), staffController.create);
staffRouter.get("/", validateQuery(listStaffQuerySchema), staffController.list);
staffRouter.get("/:staffId", staffController.get);
staffRouter.patch("/:staffId", validateBody(updateStaffSchema), staffController.update);
staffRouter.put("/:staffId/services", validateBody(assignServicesSchema), staffController.assignServices);
staffRouter.put("/:staffId/schedule", validateBody(updateScheduleSchema), staffController.updateSchedule);
