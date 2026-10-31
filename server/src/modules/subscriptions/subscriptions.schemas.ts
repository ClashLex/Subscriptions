import { z } from "zod";
import { isoDateSchema } from "../plans/plans.schemas.js";

const lineSchema = z.object({
  productId: z.number().int().positive(),
  variantId: z.number().int().positive().optional(),
  quantity: z.number().int().min(1).max(100000),
  taxId: z.number().int().positive().optional(),
  /** Only honoured when a template is not the source: omitted → catalogue price. */
});

export const subscriptionCreateSchema = z
  .object({
    customerId: z.number().int().positive(),
    planId: z.number().int().positive(),
    templateId: z.number().int().positive().optional(),
    startDate: isoDateSchema.optional(),
    /** Contract end; omitted means open-ended and billed every interval. */
    expiryDate: isoDateSchema.nullable().optional(),
    paymentTermsDays: z.number().int().min(0).max(120).optional(),
    lines: z.array(lineSchema).min(1).max(50).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.templateId === undefined && (value.lines === undefined || value.lines.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["lines"],
        message: "Provide lines or a templateId to create a subscription.",
      });
    }
  });

export const subscriptionUpdateSchema = z.object({
  startDate: isoDateSchema.optional(),
  expiryDate: isoDateSchema.nullable().optional(),
  paymentTermsDays: z.number().int().min(0).max(120).optional(),
  planId: z.number().int().positive().optional(),
  lines: z.array(lineSchema).min(1).max(50).optional(),
});

export const reasonSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

export const quotationSubmitSchema = z.object({
  validityDays: z.number().int().min(1).max(365).optional(),
  reason: z.string().trim().max(500).optional(),
});

export const subscriptionListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  status: z.enum(["DRAFT", "QUOTATION", "CONFIRMED", "ACTIVE", "PAUSED", "CLOSED"]).optional(),
  customerId: z.coerce.number().int().positive().optional(),
});

export type SubscriptionLineInput = z.infer<typeof lineSchema>;
export type SubscriptionCreateDto = z.infer<typeof subscriptionCreateSchema>;
export type SubscriptionUpdateDto = z.infer<typeof subscriptionUpdateSchema>;
