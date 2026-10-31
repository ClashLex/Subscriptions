import { z } from "zod";

const templateItemSchema = z.object({
  productId: z.number().int().positive(),
  variantId: z.number().int().positive().optional(),
  quantity: z.number().int().min(1).max(100000),
  taxId: z.number().int().positive().optional(),
  isAddOn: z.boolean().optional(),
});

export const templateCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(255),
  validityDays: z.number().int().min(1).max(365).optional(),
  defaultPlanId: z.number().int().positive().optional(),
  items: z.array(templateItemSchema).min(1, "A template needs at least one item.").max(50),
});

export const templateUpdateSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  validityDays: z.number().int().min(1).max(365).optional(),
  defaultPlanId: z.number().int().positive().nullable().optional(),
  items: z.array(templateItemSchema).min(1).max(50).optional(),
});

export const templateQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

export type TemplateItemInput = z.infer<typeof templateItemSchema>;
export type TemplateCreateDto = z.infer<typeof templateCreateSchema>;
export type TemplateUpdateDto = z.infer<typeof templateUpdateSchema>;
