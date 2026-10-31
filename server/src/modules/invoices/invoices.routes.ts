import { Router } from "express";
import { z } from "zod";
import { AppError, asyncHandler } from "../../middleware/errors.js";
import { requireAuth, requireStaffOrAdmin } from "../auth/auth.middleware.js";
import {
  invoiceActionSchema,
  invoiceListQuerySchema,
  paymentCreateSchema,
  paymentQuerySchema,
} from "./invoices.schemas.js";
import {
  cancelInvoice,
  confirmInvoice,
  getInvoiceDetail,
  listInvoices,
  listPayments,
  recordPayment,
} from "./invoices.service.js";

/**
 * Invoices (Billing/Finance §8) and payments (§9).
 * Customers may read ONLY their own invoices/payments — ownership derives from
 * the session, never from request params (API_CONTRACT §7).
 */
export const invoicesRouter = Router();

invoicesRouter.use(requireAuth);

const idParam = z.coerce.number().int().positive();

function isCustomer(role: string | undefined): boolean {
  return role === "CUSTOMER";
}

/** Resolves the enforced customer filter: customers are pinned to own rows. */
function customerIdFor(role: string | undefined, sessionUserId: number, requested?: number): number | undefined {
  if (isCustomer(role)) {
    return sessionUserId;
  }
  return requested;
}

invoicesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = invoiceListQuerySchema.parse(req.query);
    const role = req.session.role;
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 25;
    // Customers cannot pass a customerId filter to widen their scope.
    const { rows, total } = await listInvoices({
      limit: pageSize,
      offset: (page - 1) * pageSize,
      status: q.status,
      customerId: customerIdFor(role, req.session.userId as number, q.customerId),
      subscriptionId: q.subscriptionId,
      overdueOnly: q.overdueOnly && !isCustomer(role) ? true : undefined,
      issuedFrom: q.issuedFrom,
      issuedTo: q.issuedTo,
    });
    res.status(200).json({
      data: rows,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) || 1 },
    });
  }),
);

invoicesRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = idParam.parse(req.params.id);
    const detail = await getInvoiceDetail(id);
    if (detail === null) {
      throw new AppError(404, "INVOICE_NOT_FOUND", `Invoice ${id} does not exist.`);
    }
    if (isCustomer(req.session.role) && detail.customerId !== req.session.userId) {
      // Foreign invoices are invisible, not simply forbidden.
      throw new AppError(404, "INVOICE_NOT_FOUND", `Invoice ${id} does not exist.`);
    }
    res.status(200).json({ data: detail });
  }),
);

// Admin/Staff actions from here down.
invoicesRouter.use(requireStaffOrAdmin);

invoicesRouter.post(
  "/:id/confirm",
  asyncHandler(async (req, res) => {
    const id = idParam.parse(req.params.id);
    const detail = await confirmInvoice(id, req.session.userId as number);
    res.status(200).json({ data: detail });
  }),
);

invoicesRouter.post(
  "/:id/cancel",
  asyncHandler(async (req, res) => {
    const id = idParam.parse(req.params.id);
    const options = invoiceActionSchema.parse(req.body ?? {});
    const detail = await cancelInvoice(id, req.session.userId as number, options.reason);
    res.status(200).json({ data: detail });
  }),
);

invoicesRouter.post(
  "/:id/payments",
  asyncHandler(async (req, res) => {
    const id = idParam.parse(req.params.id);
    const dto = paymentCreateSchema.parse(req.body);
    const detail = await recordPayment(id, dto, req.session.userId as number);
    res.status(201).json({ data: detail });
  }),
);

/** GET /payments lives at the API root (contract) but is served from here. */
export const paymentsRouter = Router();

paymentsRouter.use(requireAuth);

paymentsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = paymentQuerySchema.parse(req.query);
    const role = req.session.role;
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 25;
    const { rows, total } = await listPayments({
      limit: pageSize,
      offset: (page - 1) * pageSize,
      customerId: customerIdFor(role, req.session.userId as number, q.customerId),
      invoiceId: q.invoiceId,
      method: q.method,
      paidFrom: q.paidFrom,
      paidTo: q.paidTo,
    });
    res.status(200).json({
      data: rows,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) || 1 },
    });
  }),
);
