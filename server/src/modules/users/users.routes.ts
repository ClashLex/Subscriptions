import { Router } from "express";
import { asyncHandler } from "../../middleware/errors.js";
import { requireAdmin } from "../auth/auth.middleware.js";
import { staffCreateSchema, userStatusSchema } from "./users.schemas.js";
import { createStaff, listUsers, setAccountStatus } from "./users.service.js";

/**
 * Admin user management. Both routes require ADMIN on the backend even if a
 * UI hides the buttons (SECURITY_AND_ACCESS.md §6).
 */
export const usersRouter = Router();

usersRouter.use(requireAdmin);

usersRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.pageSize ?? 25) || 25, 100);
    const page = Math.max(Number(req.query.page ?? 1) || 1, 1);
    const offset = (page - 1) * limit;
    const { rows, total } = await listUsers(limit, offset);
    res.status(200).json({
      data: rows,
      meta: { page, pageSize: limit, total, totalPages: Math.ceil(total / limit) || 1 },
    });
  }),
);

usersRouter.post(
  "/staff",
  asyncHandler(async (req, res) => {
    const dto = staffCreateSchema.parse(req.body);
    const staff = await createStaff(dto);
    res.status(201).json({ data: { user: staff } });
  }),
);

usersRouter.patch(
  "/:id/status",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const dto = userStatusSchema.parse(req.body);
    const actorId = req.session.userId as number;
    const result = await setAccountStatus(actorId, id, dto.isActive);
    res.status(200).json({ data: result });
  }),
);
