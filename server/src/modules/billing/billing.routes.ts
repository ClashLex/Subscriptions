import { Router } from "express";
import { asyncHandler } from "../../middleware/errors.js";
import { requireAdmin } from "../auth/auth.middleware.js";
import { runBilling } from "./billing.service.js";

/**
 * Manual billing trigger (BILLING_AND_FINANCE §7, API_CONTRACT §3).
 * Access is Admin-only as the documented base policy — repeating the call never
 * duplicates invoices (uq_invoice_period) or advances dates a second time.
 */
export const billingRouter = Router();

billingRouter.post(
  "/run",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const result = await runBilling(req.session.userId as number);
    res.status(200).json({ data: result });
  }),
);
