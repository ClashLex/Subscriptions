import { z } from "zod";
import { nonNegativeMoneySchema } from "../../lib/money.js";

export const billingIntervalUnitSchema = z.enum(["DAY", "WEEK", "MONTH", "YEAR"]);
export const isoDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Dates use the YYYY-MM-DD format.");

export const planCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(255),
  description: z.string().trim().max(2000).optional(),
  price: nonNegativeMoneySchema,
  billingIntervalUnit: billingIntervalUnitSchema.optional(),
  billingIntervalCount: z.number().int().min(1).max(365).optional(),
  minimumQuantity: z.number().int().min(1).max(1_000_000).optional(),
  availableFrom: isoDateSchema.nullable().optional(),
  availableUntil: isoDateSchema.nullable().optional(),
  allowPause: z.boolean().optional(),
  allowEarlyClose: z.boolean().optional(),
  allowRenewal: z.boolean().optional(),
  autoClose: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export const planUpdateSchema = planCreateSchema.partial();

export const planQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  includeInactive: z.enum(["0", "1"]).optional(), // honoured for Admin/Staff requests only
});

export type PlanCreateDto = z.infer<typeof planCreateSchema>;
export type PlanUpdateDto = z.infer<typeof planUpdateSchema>;
