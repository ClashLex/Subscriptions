import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../../middleware/errors.js";
import { requireStaffOrAdmin } from "../auth/auth.middleware.js";
import { getFinanceSummary } from "./finance.service.js";

export const financeRouter = Router();
financeRouter.use(requireStaffOrAdmin);

const summaryQuery = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
}).refine((value) => value.from <= value.to, {
  path: ["to"], message: "End date must not precede start date.",
});

financeRouter.get("/summary", asyncHandler(async (req, res) => {
  const { from, to } = summaryQuery.parse(req.query);
  res.status(200).json({ data: await getFinanceSummary(from, to) });
}));
