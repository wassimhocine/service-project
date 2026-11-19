import { Router } from "express";
import { validateBody } from "../../middleware/index.js";
import * as authController from "./auth.controller.js";
import { loginSchema, registerSchema } from "./auth.schemas.js";

export const authRouter = Router();

authRouter.post("/register", validateBody(registerSchema), authController.register);
authRouter.post("/login", validateBody(loginSchema), authController.login);
