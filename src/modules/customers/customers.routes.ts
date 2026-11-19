import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { validateBody, validateQuery } from "../../middleware/validate.js";
import * as customersController from "./customers.controller.js";
import {
  createCustomerSchema,
  listCustomersQuerySchema,
  updateCustomerSchema,
} from "./customers.schemas.js";

export const customersRouter = Router({ mergeParams: true });

customersRouter.use(authenticate);

customersRouter.post("/", validateBody(createCustomerSchema), customersController.create);
customersRouter.get("/", validateQuery(listCustomersQuerySchema), customersController.list);
customersRouter.get("/:customerId", customersController.get);
customersRouter.patch("/:customerId", validateBody(updateCustomerSchema), customersController.update);
