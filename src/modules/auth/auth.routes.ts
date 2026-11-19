import { Router } from "express";
import { authenticate, validateBody } from "../../middleware/index.js";
import * as authController from "./auth.controller.js";
import { loginSchema, registerSchema, updateProfileSchema } from "./auth.schemas.js";

export const authRouter = Router();

authRouter.post("/register", validateBody(registerSchema), authController.register);
authRouter.post("/login", validateBody(loginSchema), authController.login);
authRouter.post("/logout", authenticate, authController.logout);
authRouter.get("/me", authenticate, authController.me);
authRouter.patch("/me", authenticate, validateBody(updateProfileSchema), authController.updateMe);
