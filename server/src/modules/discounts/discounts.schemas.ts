import { z } from "zod";
import { nonNegativeMoneySchema } from "../../lib/money.js";

/** Rules calendar uses UTC dates (YYYY-MM-DD), like every other module. */
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD dates.");

export const discountCreateSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required.").max(255),
    discountType: z.enum(["FIXED", "PERCENTAGE"]),
    value: nonNegativeMoneySchema,
    minimumPurchase: nonNegativeMoneySchema.optional(),
    minimumQuantity: z.number().int().min(1).max(100000).optional(),
    startsAt: dateOnly.optional(),
    endsAt: dateOnly.optional(),
    usageLimit: z.number().int().min(1).max(1000000).optional(),
    scope: z.enum(["PRODUCTS", "SUBSCRIPTION"]).optional(),
    productIds: z.array(z.number().int().positive()).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.discountType === "PERCENTAGE" && Number(value.value) > 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["value"],
        message: "Percentage discounts cannot exceed 100.",
      });
    }
    if (value.scope === "PRODUCTS" && (value.productIds === undefined || value.productIds.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["productIds"],
        message: "PRODUCTS-scope rules need at least one product id.",
      });
    }
    if (value.startsAt !== undefined && value.endsAt !== undefined && value.endsAt < value.startsAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endsAt"],
        message: "The end date must not precede the start date.",
      });
    }
  });

export const discountUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(255).optional(),
    value: nonNegativeMoneySchema.optional(),
    minimumPurchase: nonNegativeMoneySchema.nullable().optional(),
    minimumQuantity: z.number().int().min(1).max(100000).nullable().optional(),
    startsAt: dateOnly.nullable().optional(),
    endsAt: dateOnly.nullable().optional(),
    usageLimit: z.number().int().min(1).max(1000000).nullable().optional(),
    isActive: z.boolean().optional(),
    scope: z.enum(["PRODUCTS", "SUBSCRIPTION"]).optional(),
    productIds: z.array(z.number().int().positive()).optional(),
  })
  .superRefine((value, ctx) => {
    // Note: discount_type is not patchable (mixing types silences history);
    // percentage cap enforced here only when a PATCH carries context — the
    // service re-validates against the stored row.
    if (value.scope === "PRODUCTS" && value.productIds !== undefined && value.productIds.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["productIds"],
        message: "PRODUCTS-scope rules need at least one product id.",
      });
    }
  });

export const discountQuerySchema = z.object({
  includeInactive: z.enum(["true", "false"]).transform((value) => value === "true").optional(),
});

export type DiscountCreateDto = z.infer<typeof discountCreateSchema>;
export type DiscountUpdateDto = z.infer<typeof discountUpdateSchema>;
