import { Router } from "express";
import { z } from "zod";
import { AppError, asyncHandler } from "../../middleware/errors.js";
import { requireAuth, requireStaffOrAdmin } from "../auth/auth.middleware.js";
import {
  quotationSubmitSchema,
  reasonSchema,
  subscriptionCreateSchema,
  subscriptionListQuerySchema,
  subscriptionUpdateSchema,
} from "./subscriptions.schemas.js";
import {
  activateSubscription,
  closeSubscription,
  confirmQuotation,
  createSubscription,
  getSubscriptionDetail,
  listSubscriptions,
  pauseSubscription,
  renewSubscription,
  resumeSubscription,
  submitQuotation,
  updateSubscription,
} from "./subscriptions.service.js";

export const subscriptionsRouter = Router();

// Everything requires a session; customers get read access to their own rows
// only, enforced server-side (SECURITY_AND_ACCESS §4).
subscriptionsRouter.use(requireAuth);

const idParam = z.coerce.number().int().positive();

function sessionRole(role: string | undefined): "ADMIN" | "STAFF" | "CUSTOMER" {
  if (role === "ADMIN" || role === "STAFF" || role === "CUSTOMER") {
    return role;
  }
  throw new AppError(401, "UNAUTHENTICATED", "Sign in to continue.");
}

/** The listing honours the same pagination contract across the catalogue. */
subscriptionsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = subscriptionListQuerySchema.parse(req.query);
    const role = sessionRole(req.session.role);
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 25;
    const customerId = role === "CUSTOMER" ? req.session.userId : q.customerId;
    const { rows, total } = await listSubscriptions({
      status: q.status,
      customerId,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });
    res.status(200).json({
      data: rows,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) || 1 },
    });
  }),
);

subscriptionsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = idParam.parse(req.params.id);
    const role = sessionRole(req.session.role);
    const detail = await getSubscriptionDetail(id);
    if (!detail) {
      throw new AppError(404, "NOT_FOUND", "Subscription not found.");
    }
    if (role === "CUSTOMER" && detail.customerId !== req.session.userId) {
      throw new AppError(404, "NOT_FOUND", "Subscription not found.");
    }
    res.status(200).json({ data: detail });
  }),
);

subscriptionsRouter.post(
  "/",
  requireStaffOrAdmin,
  asyncHandler(async (req, res) => {
    const dto = subscriptionCreateSchema.parse(req.body);
    const detail = await createSubscription(dto, req.session.userId as number);
    res.status(201).json({ data: detail });
  }),
);

subscriptionsRouter.patch(
  "/:id",
  requireStaffOrAdmin,
  asyncHandler(async (req, res) => {
    const id = idParam.parse(req.params.id);
    const dto = subscriptionUpdateSchema.parse(req.body);
    const detail = await updateSubscription(id, dto, req.session.userId as number);
    res.status(200).json({ data: detail });
  }),
);

/** Draft → Quotation: sets the validity end from template or body. */
subscriptionsRouter.post(
  "/:id/quotation",
  requireStaffOrAdmin,
  asyncHandler(async (req, res) => {
    const id = idParam.parse(req.params.id);
    const options = quotationSubmitSchema.parse(req.body);
    const detail = await submitQuotation(id, req.session.userId as number, options);
    res.status(200).json({ data: detail });
  }),
);

/** Quotation → Confirmed: allowed only inside the quotation validity window. */
subscriptionsRouter.post(
  "/:id/confirm",
  requireStaffOrAdmin,
  asyncHandler(async (req, res) => {
    const id = idParam.parse(req.params.id);
    const options = reasonSchema.parse(req.body);
    const detail = await confirmQuotation(id, req.session.userId as number, options);
    res.status(200).json({ data: detail });
  }),
);

/** Confirmed → Active: permitted on or after the start date. */
subscriptionsRouter.post(
  "/:id/activate",
  requireStaffOrAdmin,
  asyncHandler(async (req, res) => {
    const id = idParam.parse(req.params.id);
    const options = reasonSchema.parse(req.body);
    const detail = await activateSubscription(id, req.session.userId as number, options);
    res.status(200).json({ data: detail });
  }),
);

/** Active → Paused (only when the plan allows pause). */
subscriptionsRouter.post(
  "/:id/pause",
  requireStaffOrAdmin,
  asyncHandler(async (req, res) => {
    const id = idParam.parse(req.params.id);
    const options = reasonSchema.parse(req.body);
    const detail = await pauseSubscription(id, req.session.userId as number, options);
    res.status(200).json({ data: detail });
  }),
);

/** Paused → Active: shifts next billing by the paused duration. */
subscriptionsRouter.post(
  "/:id/resume",
  requireStaffOrAdmin,
  asyncHandler(async (req, res) => {
    const id = idParam.parse(req.params.id);
    const options = reasonSchema.parse(req.body);
    const detail = await resumeSubscription(id, req.session.userId as number, options);
    res.status(200).json({ data: detail });
  }),
);

/** Active/Paused → Closed: plan early-close rules with an Admin override. */
subscriptionsRouter.post(
  "/:id/close",
  requireStaffOrAdmin,
  asyncHandler(async (req, res) => {
    const id = idParam.parse(req.params.id);
    const options = reasonSchema.parse(req.body);
    const detail = await closeSubscription(
      id,
      req.session.userId as number,
      sessionRole(req.session.role),
      options,
    );
    res.status(200).json({ data: detail });
  }),
);

/** Active/Closed → new linked draft when the plan allows renewal. */
subscriptionsRouter.post(
  "/:id/renew",
  requireStaffOrAdmin,
  asyncHandler(async (req, res) => {
    const id = idParam.parse(req.params.id);
    const options = reasonSchema.parse(req.body);
    const detail = await renewSubscription(id, req.session.userId as number, options);
    res.status(201).json({ data: detail });
  }),
);
