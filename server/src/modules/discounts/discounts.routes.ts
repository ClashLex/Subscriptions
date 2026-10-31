import { Router } from "express";
import { z } from "zod";
import { AppError, asyncHandler } from "../../middleware/errors.js";
import { requireAdmin, requireStaffOrAdmin } from "../auth/auth.middleware.js";
import { discountCreateSchema, discountQuerySchema, discountUpdateSchema } from "./discounts.schemas.js";
import { createDiscount, getDiscountById, listDiscounts, updateDiscount } from "./discounts.service.js";

/**
 * Discount rule management per BILLING_AND_FINANCE §5: reads are Admin/Staff
 * (billing explanations), rule writes are Admin only. Enforcement and one
 * redemption semantics live in the billing service.
 */
export const discountsRouter = Router();

// Discounts are staff/admin visibility; the write routes below tighten to Admin.
discountsRouter.use(requireStaffOrAdmin);

const idParam = z.coerce.number().int().positive();

discountsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    // Staff see active rules; Admin may inspect inactive ones too.
    const q = discountQuerySchema.parse(req.query);
    const includeInactive = q.includeInactive === true && req.session.role === "ADMIN";
    const discounts = await listDiscounts(includeInactive);
    res.status(200).json({
      data: discounts,
      meta: { page: 1, pageSize: discounts.length, total: discounts.length, totalPages: 1 },
    });
  }),
);

discountsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = idParam.parse(req.params.id);
    const discount = await getDiscountById(id);
    if (discount === null) {
      throw new AppError(404, "DISCOUNT_NOT_FOUND", `Discount ${id} does not exist.`);
    }
    res.status(200).json({ data: discount });
  }),
);

discountsRouter.post(
  "/",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const dto = discountCreateSchema.parse(req.body);
    const discount = await createDiscount(dto, req.session.userId as number);
    res.status(201).json({ data: discount });
  }),
);

discountsRouter.patch(
  "/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const dto = discountUpdateSchema.parse(req.body);
    const discount = await updateDiscount(idParam.parse(req.params.id), dto);
    res.status(200).json({ data: discount });
  }),
);
