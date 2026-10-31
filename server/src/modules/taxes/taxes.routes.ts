import { Router } from "express";
import { z } from "zod";
import { AppError, asyncHandler } from "../../middleware/errors.js";
import { requireAdmin, requireStaffOrAdmin } from "../auth/auth.middleware.js";
import { taxCreateSchema, taxUpdateSchema } from "./taxes.schemas.js";
import { createTax, getTaxById, listTaxes, toTaxDto, updateTax } from "./taxes.service.js";

export const taxesRouter = Router();

const idParam = z.coerce.number().int().positive();

// Tax config is finance setup: reads for Admin/Staff, writes Admin-only.
taxesRouter.use(requireStaffOrAdmin);

taxesRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const rows = await listTaxes();
    res.status(200).json({ data: rows.map(toTaxDto) });
  }),
);

taxesRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = idParam.parse(req.params.id);
    const tax = await getTaxById(id);
    if (!tax) {
      throw new AppError(404, "NOT_FOUND", "Tax rule not found.");
    }
    res.status(200).json({ data: toTaxDto(tax) });
  }),
);

taxesRouter.post(
  "/",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const dto = taxCreateSchema.parse(req.body);
    const tax = await createTax(dto);
    res.status(201).json({ data: toTaxDto(tax) });
  }),
);

taxesRouter.patch(
  "/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = idParam.parse(req.params.id);
    const dto = taxUpdateSchema.parse(req.body);
    const tax = await updateTax(id, dto);
    res.status(200).json({ data: toTaxDto(tax) });
  }),
);
