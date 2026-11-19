import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { validateBody, validateQuery } from "../../middleware/validate.js";
import * as servicesController from "./services.controller.js";
import {
  createServiceSchema,
  listServicesQuerySchema,
  updateServiceSchema,
} from "./services.schemas.js";

export const servicesRouter = Router({ mergeParams: true });

servicesRouter.use(authenticate);

servicesRouter.post("/", validateBody(createServiceSchema), servicesController.create);
servicesRouter.get("/", validateQuery(listServicesQuerySchema), servicesController.list);
servicesRouter.get("/:serviceId", servicesController.get);
servicesRouter.patch("/:serviceId", validateBody(updateServiceSchema), servicesController.update);
servicesRouter.delete("/:serviceId", servicesController.deactivate);
