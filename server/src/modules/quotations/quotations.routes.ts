import { Router } from "express";
import { z } from "zod";
import { AppError, asyncHandler } from "../../middleware/errors.js";
import { requireStaffOrAdmin } from "../auth/auth.middleware.js";
import { templateCreateSchema, templateQuerySchema, templateUpdateSchema } from "./quotations.schemas.js";
import { createTemplate, getTemplateById, listTemplates, updateTemplate } from "./quotations.service.js";

export const templatesRouter = Router();

// Quotation templates are internal tooling: staff and admin manage them.
templatesRouter.use(requireStaffOrAdmin);

const idParam = z.coerce.number().int().positive();

templatesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = templateQuerySchema.parse(req.query);
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 25;
    const { rows, total } = await listTemplates({
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });
    res.status(200).json({
      data: rows,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) || 1 },
    });
  }),
);

templatesRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = idParam.parse(req.params.id);
    const template = await getTemplateById(id);
    if (!template) {
      throw new AppError(404, "NOT_FOUND", "Quotation template not found.");
    }
    res.status(200).json({ data: template });
  }),
);

templatesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const dto = templateCreateSchema.parse(req.body);
    const template = await createTemplate(dto, req.session.userId as number);
    res.status(201).json({ data: template });
  }),
);

templatesRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = idParam.parse(req.params.id);
    const dto = templateUpdateSchema.parse(req.body);
    const template = await updateTemplate(id, dto);
    res.status(200).json({ data: template });
  }),
);
