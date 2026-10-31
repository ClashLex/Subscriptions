import { z } from "zod";
import { nonNegativeMoneySchema, moneySchema } from "../../lib/money.js";

export const productCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(255),
  type: z.string().trim().min(1, "Type is required.").max(80),
  salesPrice: nonNegativeMoneySchema,
  costPrice: nonNegativeMoneySchema,
  notes: z.string().trim().max(2000).optional(),
  isActive: z.boolean().optional(),
});

export const productUpdateSchema = productCreateSchema.partial();

export const variantCreateSchema = z.object({
  name: z.string().trim().min(1, "Variant name is required.").max(255),
  priceAdjustment: moneySchema, // may be negative; effective price must stay >= 0
});

export const variantUpdateSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  priceAdjustment: moneySchema.optional(),
  isActive: z.boolean().optional(),
});

export const productQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  search: z.string().trim().max(80).optional(),
  includeInactive: z.enum(["0", "1"]).optional(),
});

export type ProductCreateDto = z.infer<typeof productCreateSchema>;
export type ProductUpdateDto = z.infer<typeof productUpdateSchema>;
export type VariantCreateDto = z.infer<typeof variantCreateSchema>;
export type VariantUpdateDto = z.infer<typeof variantUpdateSchema>;
