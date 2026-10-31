import { z } from "zod";

/** Rate as "18.00" for 18 % (0–99.99, exclusive/inclusive of decimals). */
export const taxRateSchema = z
  .string()
  .trim()
  .regex(/^\d{1,2}(\.\d{1,2})?$/, "Rate must be between 0 and 99.99, e.g. \"18\".");

const taxModeSchema = z.enum(["EXCLUSIVE", "INCLUSIVE"]);

export const taxCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(120),
  rate: taxRateSchema,
  taxMode: taxModeSchema.optional(),
});

export const taxUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  rate: taxRateSchema.optional(),
  taxMode: taxModeSchema.optional(),
  isActive: z.boolean().optional(),
});

export type TaxCreateDto = z.infer<typeof taxCreateSchema>;
export type TaxUpdateDto = z.infer<typeof taxUpdateSchema>;
