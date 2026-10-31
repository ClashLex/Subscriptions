import type { NextFunction, Request, Response } from "express";
import { AppError } from "../../middleware/errors.js";
import type { UserRole } from "./auth.repository.js";

/** 401 unless a signed-in session exists. */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.session.userId) {
    next(new AppError(401, "UNAUTHENTICATED", "Sign in to continue."));
    return;
  }
  next();
}

/** Enforce roles on the backend — frontend hiding is not authorization. */
export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const role = req.session.role;
    if (!role) {
      next(new AppError(401, "UNAUTHENTICATED", "Sign in to continue."));
      return;
    }
    if (!roles.includes(role)) {
      next(new AppError(403, "FORBIDDEN", "Your role does not permit this action."));
      return;
    }
    next();
  };
}

export const requireAdmin = requireRole("ADMIN");
export const requireStaffOrAdmin = requireRole("ADMIN", "STAFF");
