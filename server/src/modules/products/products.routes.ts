import { Router } from "express";
import { asyncHandler, AppError } from "../../middleware/errors.js";
import { requireAdmin, requireStaffOrAdmin } from "../auth/auth.middleware.js";
import { z } from "zod";
import {
  productCreateSchema,
  productQuerySchema,
  productUpdateSchema,
  variantCreateSchema,
  variantUpdateSchema,
} from "./products.schemas.js";
import {
  createProduct,
  createVariant,
  getProductById,
  listProducts,
  listVariantsForProduct,
  toProductDto,
  toVariantDto,
  updateProduct,
  updateVariant,
} from "./products.service.js";

export const productsRouter = Router();

// Reads: Admin and Staff. Customers do not receive catalogue pricing
// (role matrix — SECURITY_AND_ACCESS.md §5).
productsRouter.use(requireStaffOrAdmin);

productsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = productQuerySchema.parse(req.query);
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 25;
    const { rows, total } = await listProducts({
      search: q.search,
      includeInactive: (q.includeInactive ?? "0") === "1",
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });
    res.status(200).json({
      data: rows.map(toProductDto),
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) || 1 },
    });
  }),
);

const idParam = z.coerce.number().int().positive();

productsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = idParam.parse(req.params.id);
    const product = await getProductById(id);
    if (!product) {
      throw new AppError(404, "NOT_FOUND", "Product not found.");
    }
    const variants = await listVariantsForProduct(id);
    res
      .status(200)
      .json({ data: { ...toProductDto(product), variants: variants.map((v) => toVariantDto(v, product.sales_price)) } });
  }),
);

productsRouter.post(
  "/",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const dto = productCreateSchema.parse(req.body);
    const product = await createProduct(dto);
    res.status(201).json({ data: toProductDto(product) });
  }),
);

productsRouter.patch(
  "/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = idParam.parse(req.params.id);
    const dto = productUpdateSchema.parse(req.body);
    const product = await updateProduct(id, dto);
    res.status(200).json({ data: toProductDto(product) });
  }),
);

productsRouter.post(
  "/:id/variants",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = idParam.parse(req.params.id);
    const dto = variantCreateSchema.parse(req.body);
    const variant = await createVariant(id, dto);
    res.status(201).json({ data: variant });
  }),
);

productsRouter.patch(
  "/:id/variants/:variantId",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = idParam.parse(req.params.id);
    const variantId = idParam.parse(req.params.variantId);
    const dto = variantUpdateSchema.parse(req.body);
    const variant = await updateVariant(id, variantId, dto);
    res.status(200).json({ data: variant });
  }),
);
