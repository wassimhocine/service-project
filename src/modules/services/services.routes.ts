import { Router } from "express";
import { validateBody, validateParams, validateQuery } from "../../middleware/index.js";
import { uuidParams } from "../../utils/params.js";
import * as servicesController from "./services.controller.js";
import {
  createServiceSchema,
  listServicesQuerySchema,
  updateServiceSchema,
} from "./services.schemas.js";

export const servicesRouter = Router({ mergeParams: true });

const serviceIdParams = validateParams(uuidParams("id", "serviceId"));

servicesRouter.post("/", validateBody(createServiceSchema), servicesController.create);
servicesRouter.get("/", validateQuery(listServicesQuerySchema), servicesController.list);
servicesRouter.get("/:serviceId", serviceIdParams, servicesController.get);
servicesRouter.patch(
  "/:serviceId",
  serviceIdParams,
  validateBody(updateServiceSchema),
  servicesController.update
);
servicesRouter.delete("/:serviceId", serviceIdParams, servicesController.deactivate);
