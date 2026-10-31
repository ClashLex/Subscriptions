import { z } from "zod";
import { nonNegativeMoneySchema } from "../../lib/money.js";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD dates.");
const queryBoolean = z.enum(["true", "false"]).transform((value) => value === "true").optional();

export const invoiceListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  status: z.enum(["DRAFT", "CONFIRMED", "PAID", "CANCELLED"]).optional(),
  customerId: z.coerce.number().int().positive().optional(),
  subscriptionId: z.coerce.number().int().positive().optional(),
  overdueOnly: queryBoolean,
  issuedFrom: isoDate.optional(),
  issuedTo: isoDate.optional(),
});

export const invoiceActionSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

export const paymentCreateSchema = z.object({
  method: z.string().trim().min(1, "Payment method is required.").max(40),
  amount: nonNegativeMoneySchema,
  paidAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?$/, "Use YYYY-MM-DD or YYYY-MM-DD HH:MM:SS.")
    .optional(),
  note: z.string().trim().max(500).optional(),
  reference: z.string().trim().max(120).optional(),
});

export const paymentQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  customerId: z.coerce.number().int().positive().optional(),
  invoiceId: z.coerce.number().int().positive().optional(),
  method: z.string().trim().max(40).optional(),
  paidFrom: isoDate.optional(),
  paidTo: isoDate.optional(),
});

export type PaymentCreateDto = z.infer<typeof paymentCreateSchema>;
