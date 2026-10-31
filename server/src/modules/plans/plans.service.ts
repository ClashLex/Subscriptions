import { RowDataPacket } from "mysql2/promise";
import { AppError } from "../../middleware/errors.js";
import { query, execute } from "../../config/db.js";
import type { PlanCreateDto, PlanUpdateDto } from "./plans.schemas.js";

export interface PlanRow extends RowDataPacket {
  id: number;
  name: string;
  description: string | null;
  price: string;
  billing_interval_unit: "DAY" | "WEEK" | "MONTH" | "YEAR";
  billing_interval_count: number;
  minimum_quantity: number;
  available_from: string | null;
  available_until: string | null;
  allow_pause: 0 | 1;
  allow_early_close: 0 | 1;
  allow_renewal: 0 | 1;
  auto_close: 0 | 1;
  is_active: 0 | 1;
}

export interface PlanDto {
  id: number;
  name: string;
  description: string | null;
  price: string;
  billingIntervalUnit: "DAY" | "WEEK" | "MONTH" | "YEAR";
  billingIntervalCount: number;
  minimumQuantity: number;
  availableFrom: string | null;
  availableUntil: string | null;
  allowPause: boolean;
  allowEarlyClose: boolean;
  allowRenewal: boolean;
  autoClose: boolean;
  isActive: boolean;
}

export function toPlanDto(row: PlanRow): PlanDto {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    price: row.price,
    billingIntervalUnit: row.billing_interval_unit,
    billingIntervalCount: row.billing_interval_count,
    minimumQuantity: row.minimum_quantity,
    availableFrom: row.available_from,
    availableUntil: row.available_until,
    allowPause: row.allow_pause === 1,
    allowEarlyClose: row.allow_early_close === 1,
    allowRenewal: row.allow_renewal === 1,
    autoClose: row.auto_close === 1,
    isActive: row.is_active === 1,
  };
}

/** A plan is sellable during its availability window while active (UTC date). */
export function isPlanCurrentlyAvailable(row: PlanRow, today = new Date().toISOString().slice(0, 10)): boolean {
  if (row.is_active === 0) return false;
  if (row.available_from && row.available_from > today) return false;
  if (row.available_until && row.available_until < today) return false;
  return true;
}

export async function listPlans(options: {
  includeInactive: boolean;
  availableOnly: boolean;
  limit: number;
  offset: number;
}): Promise<{ rows: PlanRow[]; total: number }> {
  const conditions: string[] = [];
  if (options.availableOnly) {
    conditions.push(
      "p.is_active = 1",
      "(p.available_from IS NULL OR p.available_from <= CURDATE())",
      "(p.available_until IS NULL OR p.available_until >= CURDATE())",
    );
  } else if (!options.includeInactive) {
    conditions.push("p.is_active = 1");
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = await query<PlanRow[]>(
    `SELECT * FROM plans p ${where} ORDER BY p.name LIMIT ? OFFSET ?`,
    [options.limit, options.offset],
  );
  const countRows = await query<Array<RowDataPacket & { total: number }>>(
    `SELECT COUNT(*) AS total FROM plans p ${where}`,
  );
  return { rows, total: Number(countRows[0]?.total ?? 0) };
}

export async function getPlanById(id: number): Promise<PlanRow | null> {
  const rows = await query<PlanRow[]>(
    "SELECT * FROM plans WHERE id = ? LIMIT 1",
    [id],
  );
  return rows[0] ?? null;
}

function validateAvailabilityWindow(dto: PlanCreateDto | PlanUpdateDto): void {
  if (
    dto.availableFrom && dto.availableUntil
    && dto.availableFrom > dto.availableUntil
  ) {
    throw new AppError(400, "INVALID_AVAILABILITY_WINDOW", "availableFrom must be on or before availableUntil.");
  }
}

export async function createPlan(dto: PlanCreateDto): Promise<PlanRow> {
  validateAvailabilityWindow(dto);
  try {
    const result = await execute(
      `INSERT INTO plans (name, description, price, billing_interval_unit, billing_interval_count,
       minimum_quantity, available_from, available_until, allow_pause, allow_early_close,
       allow_renewal, auto_close, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        dto.name,
        dto.description ?? null,
        dto.price,
        dto.billingIntervalUnit ?? "MONTH",
        dto.billingIntervalCount ?? 1,
        dto.minimumQuantity ?? 1,
        dto.availableFrom ?? null,
        dto.availableUntil ?? null,
        (dto.allowPause ?? true) ? 1 : 0,
        (dto.allowEarlyClose ?? true) ? 1 : 0,
        (dto.allowRenewal ?? true) ? 1 : 0,
        (dto.autoClose ?? false) ? 1 : 0,
        (dto.isActive ?? true) ? 1 : 0,
      ],
    );
    const created = await getPlanById(Number(result.insertId));
    if (!created) {
      throw new AppError(500, "INTERNAL_ERROR", "Plan creation failed unexpectedly.");
    }
    return created;
  } catch (error) {
    if (typeof error === "object" && error !== null && (error as { code?: string }).code === "ER_DUP_ENTRY") {
      throw new AppError(409, "PLAN_NAME_TAKEN", "A plan with that name already exists.");
    }
    throw error;
  }
}

export async function updatePlan(id: number, dto: PlanUpdateDto): Promise<PlanRow> {
  const existing = await getPlanById(id);
  if (!existing) {
    throw new AppError(404, "NOT_FOUND", "Plan not found.");
  }
  validateAvailabilityWindow({
    ...dto,
    availableFrom: dto.availableFrom === undefined ? existing.available_from : dto.availableFrom,
    availableUntil: dto.availableUntil === undefined ? existing.available_until : dto.availableUntil,
  });
  await execute(
    `UPDATE plans SET name = ?, description = ?, price = ?, billing_interval_unit = ?,
     billing_interval_count = ?, minimum_quantity = ?, available_from = ?, available_until = ?,
     allow_pause = ?, allow_early_close = ?, allow_renewal = ?, auto_close = ?, is_active = ?
     WHERE id = ?`,
    [
      dto.name ?? existing.name,
      dto.description === undefined ? existing.description : dto.description,
      dto.price ?? existing.price,
      dto.billingIntervalUnit ?? existing.billing_interval_unit,
      dto.billingIntervalCount ?? existing.billing_interval_count,
      dto.minimumQuantity ?? existing.minimum_quantity,
      dto.availableFrom === undefined ? existing.available_from : dto.availableFrom,
      dto.availableUntil === undefined ? existing.available_until : dto.availableUntil,
      ((dto.allowPause === undefined ? existing.allow_pause === 1 : dto.allowPause) ? 1 : 0),
      ((dto.allowEarlyClose === undefined ? existing.allow_early_close === 1 : dto.allowEarlyClose) ? 1 : 0),
      ((dto.allowRenewal === undefined ? existing.allow_renewal === 1 : dto.allowRenewal) ? 1 : 0),
      ((dto.autoClose === undefined ? existing.auto_close === 1 : dto.autoClose) ? 1 : 0),
      ((dto.isActive === undefined ? existing.is_active === 1 : dto.isActive) ? 1 : 0),
      id,
    ],
  );
  const updated = await getPlanById(id);
  if (!updated) {
    throw new AppError(500, "INTERNAL_ERROR", "Plan update failed unexpectedly.");
  }
  return updated;
}
