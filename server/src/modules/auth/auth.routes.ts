import { Router, type Request } from "express";
import rateLimit from "express-rate-limit";
import { AppError, asyncHandler } from "../../middleware/errors.js";
import { findUserById, toPublicUser } from "./auth.repository.js";
import { forgotPassword, login, register, resetPassword } from "./auth.service.js";
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from "./auth.schemas.js";
import { requireAuth } from "./auth.middleware.js";

export const authRouter = Router();

// Stricter limits for credential endpoints (SECURITY_AND_ACCESS.md §4, §7).
// Kept generous for development/demo acceptance suites; tighten values for
// production deployments via a recorded decision.
const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 200,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Too many attempts. Try again later." } },
});
const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Too many requests. Try again later." } },
});

/** Session regeneration on login (session fixation defence). */
function establishSession(
  req: Request,
  user: { id: number; role: "ADMIN" | "STAFF" | "CUSTOMER" },
): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => {
      if (error) {
        reject(error);
        return;
      }
      req.session.userId = user.id;
      req.session.role = user.role;
      resolve();
    });
  });
}

authRouter.post(
  "/register",
  asyncHandler(async (req, res) => {
    const dto = registerSchema.parse(req.body);
    const user = await register(dto);
    res.status(201).json({ data: { user, message: "Account created. You can sign in now." } });
  }),
);

authRouter.post(
  "/login",
  loginLimiter,
  asyncHandler(async (req, res) => {
    const dto = loginSchema.parse(req.body);
    const user = await login(dto);
    await establishSession(req, user);
    res.status(200).json({ data: { user } });
  }),
);

authRouter.post(
  "/logout",
  asyncHandler(async (req, res) => {
    if (!req.session.userId) {
      throw new AppError(401, "UNAUTHENTICATED", "Sign in to continue.");
    }
    await new Promise<void>((resolve, reject) => {
      req.session.destroy((error) => (error ? reject(error) : resolve()));
    });
    res.clearCookie("subscriptions.sid");
    res.status(204).send();
  }),
);

authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    // Always re-read the user: deactivation must invalidate sessions.
    const user = await findUserById(req.session.userId as number);
    if (!user || user.is_active === 0) {
      throw new AppError(401, "UNAUTHENTICATED", "Sign in to continue.");
    }
    res.status(200).json({ data: { user: toPublicUser(user) } });
  }),
);

authRouter.post(
  "/forgot-password",
  passwordResetLimiter,
  asyncHandler(async (req, res) => {
    const dto = forgotPasswordSchema.parse(req.body);
    const result = await forgotPassword(dto);
    res.status(200).json({ data: result });
  }),
);

authRouter.post(
  "/reset-password",
  passwordResetLimiter,
  asyncHandler(async (req, res) => {
    const dto = resetPasswordSchema.parse(req.body);
    const result = await resetPassword(dto);
    res.status(200).json({ data: result });
  }),
);
