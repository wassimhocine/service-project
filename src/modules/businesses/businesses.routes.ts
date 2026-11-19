import { Router } from "express";
import { authenticate, validateBody, validateParams } from "../../middleware/index.js";
import { uuidParams } from "../../utils/params.js";
import { appointmentsRouter } from "../appointments/appointments.routes.js";
import { customersRouter } from "../customers/customers.routes.js";
import { schedulingRouter } from "../scheduling/scheduling.routes.js";
import { servicesRouter } from "../services/services.routes.js";
import { staffRouter } from "../staff/staff.routes.js";
import * as businessesController from "./businesses.controller.js";
import {
  addMemberSchema,
  createBusinessSchema,
  updateBusinessSchema,
  updateMemberSchema,
} from "./businesses.schemas.js";

export const businessesRouter = Router();

const businessIdParams = validateParams(uuidParams("id"));
const memberIdParams = validateParams(uuidParams("id", "memberId"));

// All business routes require authentication
businessesRouter.use(authenticate);

businessesRouter.post("/", validateBody(createBusinessSchema), businessesController.create);
businessesRouter.get("/", businessesController.listMine);
businessesRouter.get("/:id", businessIdParams, businessesController.get);
businessesRouter.patch(
  "/:id",
  businessIdParams,
  validateBody(updateBusinessSchema),
  businessesController.update
);

// Business membership routes
businessesRouter.get("/:id/members", businessIdParams, businessesController.listMembers);
businessesRouter.post(
  "/:id/members",
  businessIdParams,
  validateBody(addMemberSchema),
  businessesController.addMember
);
businessesRouter.patch(
  "/:id/members/:memberId",
  memberIdParams,
  validateBody(updateMemberSchema),
  businessesController.updateMember
);

// Nested tenant-scoped feature routers
businessesRouter.use("/:id/customers", businessIdParams, customersRouter);
businessesRouter.use("/:id/staff", businessIdParams, staffRouter);
businessesRouter.use("/:id/appointments", businessIdParams, appointmentsRouter);
businessesRouter.use("/:id/services", businessIdParams, servicesRouter);
businessesRouter.use("/:id", businessIdParams, schedulingRouter);
