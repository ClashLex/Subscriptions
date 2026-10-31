import { Router } from "express";
import { z } from "zod";
import { AppError, asyncHandler } from "../../middleware/errors.js";
import { requireAdmin } from "../auth/auth.middleware.js";
import { planCreateSchema, planQuerySchema, planUpdateSchema } from "./plans.schemas.js";
import {
  createPlan,
  getPlanById,
  isPlanCurrentlyAvailable,
  listPlans,
  toPlanDto,
  updatePlan,
} from "./plans.service.js";
import type { UserRole } from "../auth/auth.repository.js";

export const plansRouter = Router();

const idParam = z.coerce.number().int().positive();

/**
 * Any authenticated role may read plans, but visibility differs:
 * customers only see plans that are active and inside their availability
 * window ("Plans cannot be sold outside their configured availability period",
 * REQUIREMENTS.md §2.3). Admin/Staff may list everything with includeInactive.
 */
function planVisibility(role: UserRole | undefined, includeInactiveRequested: boolean): {
  availableOnly: boolean;
  includeInactive: boolean;
} {
  if (role === "CUSTOMER") {
    return { availableOnly: true, includeInactive: false };
  }
  return { availableOnly: false, includeInactive: includeInactiveRequested };
}

plansRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = planQuerySchema.parse(req.query);
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 25;
    const visibility = planVisibility(req.session.role, (q.includeInactive ?? "0") === "1");
    const { rows, total } = await listPlans({
      ...visibility,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });
    res.status(200).json({
      data: rows.map(toPlanDto),
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) || 1 },
    });
  }),
);

plansRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = idParam.parse(req.params.id);
    const visibility = planVisibility(req.session.role, false);
    const plan = await getPlanById(id);
    if (!plan || (visibility.availableOnly && !isPlanCurrentlyAvailable(plan))) {
      throw new AppError(404, "NOT_FOUND", "Plan not found or not currently available.");
    }
    res.status(200).json({ data: toPlanDto(plan) });
  }),
);

plansRouter.post(
  "/",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const dto = planCreateSchema.parse(req.body);
    const plan = await createPlan(dto);
    res.status(201).json({ data: toPlanDto(plan) });
  }),
);

plansRouter.patch(
  "/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = idParam.parse(req.params.id);
    const dto = planUpdateSchema.parse(req.body);
    const plan = await updatePlan(id, dto);
    res.status(200).json({ data: toPlanDto(plan) });
  }),
);
