import { Router } from "express";
import { validateBody, validateParams, validateQuery } from "../../middleware/index.js";
import { uuidParams } from "../../utils/params.js";
import * as customersController from "./customers.controller.js";
import {
  createCustomerSchema,
  listCustomersQuerySchema,
  updateCustomerSchema,
} from "./customers.schemas.js";

export const customersRouter = Router({ mergeParams: true });

const customerIdParams = validateParams(uuidParams("id", "customerId"));

customersRouter.post("/", validateBody(createCustomerSchema), customersController.create);
customersRouter.get("/", validateQuery(listCustomersQuerySchema), customersController.list);
customersRouter.get("/:customerId", customerIdParams, customersController.get);
customersRouter.patch(
  "/:customerId",
  customerIdParams,
  validateBody(updateCustomerSchema),
  customersController.update
);
