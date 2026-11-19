import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { validateBody } from "../../middleware/validate.js";
import * as businessesController from "./businesses.controller.js";
import {
  addMemberSchema,
  createBusinessSchema,
  updateBusinessSchema,
  updateMemberSchema,
} from "./businesses.schemas.js";

export const businessesRouter = Router();

// All business routes require authentication
businessesRouter.use(authenticate);

businessesRouter.post("/", validateBody(createBusinessSchema), businessesController.create);
businessesRouter.get("/", businessesController.listMine);
businessesRouter.get("/:id", businessesController.get);
businessesRouter.patch("/:id", validateBody(updateBusinessSchema), businessesController.update);

// Business membership routes
businessesRouter.get("/:id/members", businessesController.listMembers);
businessesRouter.post("/:id/members", validateBody(addMemberSchema), businessesController.addMember);
businessesRouter.patch("/:id/members/:memberId", validateBody(updateMemberSchema), businessesController.updateMember);
