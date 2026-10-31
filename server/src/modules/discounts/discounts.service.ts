import { RowDataPacket, type PoolConnection, type ResultSetHeader } from "mysql2/promise";
import { AppError } from "../../middleware/errors.js";
import { query, withTransaction } from "../../config/db.js";
import type { DiscountCreateDto, DiscountUpdateDto } from "./discounts.schemas.js";

export interface DiscountRuleRow extends RowDataPacket {
  id: number;
  name: string;
  discount_type: "FIXED" | "PERCENTAGE";
  value: string;
  minimum_purchase: string | null;
  minimum_quantity: number | null;
  starts_at: string | null;
  ends_at: string | null;
  usage_limit: number | null;
  usage_count: number;
  scope: "PRODUCTS" | "SUBSCRIPTION";
  is_active: 0 | 1;
  created_by: number | null;
  created_at: string;
}

export interface DiscountDto {
  id: number;
  name: string;
  discountType: "FIXED" | "PERCENTAGE";
  value: string;
  minimumPurchase: string | null;
  minimumQuantity: number | null;
  startsAt: string | null;
  endsAt: string | null;
  usageLimit: number | null;
  usageCount: number;
  scope: "PRODUCTS" | "SUBSCRIPTION";
  isActive: boolean;
  productIds: number[];
  createdBy: number | null;
  createdAt: string;
}

function toDto(row: DiscountRuleRow, productIds: number[]): DiscountDto {
  return {
    id: row.id,
    name: row.name,
    discountType: row.discount_type,
    value: row.value,
    minimumPurchase: row.minimum_purchase,
    minimumQuantity: row.minimum_quantity,
    startsAt: row.starts_at?.slice(0, 10) ?? null,
    endsAt: row.ends_at?.slice(0, 10) ?? null,
    usageLimit: row.usage_limit,
    usageCount: row.usage_count,
    scope: row.scope,
    isActive: row.is_active === 1,
    productIds,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

/** Product ids for many rules in one query (no N+1 for the list endpoint). */
async function loadProductIds(ids: number[]): Promise<Map<number, number[]>> {
  if (ids.length === 0) {
    return new Map();
  }
  const placeholders = ids.map(() => "?").join(",");
  const rows = await query<Array<RowDataPacket & { discount_rule_id: number; product_id: number }>>(
    `SELECT discount_rule_id, product_id FROM discount_products WHERE discount_rule_id IN (${placeholders})`,
    ids,
  );
  const map = new Map<number, number[]>();
  for (const row of rows) {
    const list = map.get(row.discount_rule_id) ?? [];
    list.push(Number(row.product_id));
    map.set(row.discount_rule_id, list);
  }
  return map;
}

async function loadRow(id: number): Promise<DiscountRuleRow | null> {
  const rows = await query<DiscountRuleRow[]>("SELECT * FROM discount_rules WHERE id = ? LIMIT 1", [id]);
  return rows[0] ?? null;
}

export async function listDiscounts(includeInactive: boolean): Promise<DiscountDto[]> {
  const rows = await query<DiscountRuleRow[]>(
    includeInactive
      ? "SELECT * FROM discount_rules ORDER BY id DESC"
      : "SELECT * FROM discount_rules WHERE is_active = 1 ORDER BY id DESC",
  );
  const productIds = await loadProductIds(await rows.map((row) => row.id));
  return rows.map((row) => toDto(row, productIds.get(row.id) ?? []));
}

export async function getDiscountById(id: number): Promise<DiscountDto | null> {
  const row = await loadRow(id);
  if (row === null) {
    return null;
  }
  const productIds = await loadProductIds([id]);
  return toDto(row, productIds.get(id) ?? []);
}

/** Asserts every listed product exists (PRODUCTS-scope integrity). */
async function assertProductsExist(productIds: number[]): Promise<void> {
  if (productIds.length === 0) {
    return;
  }
  const placeholders = productIds.map(() => "?").join(",");
  const rows = await query<Array<RowDataPacket & { id: number; is_active: 0 | 1 }>>(
    `SELECT id, is_active FROM products WHERE id IN (${placeholders})`,
    productIds,
  );
  const known = new Set(rows.map((row) => Number(row.id)));
  const unknown = productIds.filter((id) => !known.has(id));
  if (unknown.length > 0) {
    throw new AppError(400, "PRODUCT_NOT_FOUND", `Unknown product ids: ${unknown.join(", ")}.`);
  }
}

function duplicateName(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "ER_DUP_ENTRY";
}

function normalizeWindow(startsAt?: string | null, endsAt?: string | null): { starts: string | null; ends: string | null } {
  // Date-only inputs become bookend UTC datetimes in the DATETIME columns.
  const starts = startsAt ? `${startsAt} 00:00:00` : null;
  const ends = endsAt ? `${endsAt} 23:59:59` : null;
  return { starts, ends };
}

function validateValues(dto: { discountType?: "FIXED" | "PERCENTAGE"; value: string; startsAt?: string | null; endsAt?: string | null }): void {
  if (dto.discountType === "PERCENTAGE" && Number(dto.value) > 100) {
    throw new AppError(400, "INVALID_DISCOUNT", "Percentage discounts cannot exceed 100.");
  }
  const { starts, ends } = normalizeWindow(dto.startsAt, dto.endsAt);
  if (starts !== null && ends !== null && ends < starts) {
    throw new AppError(400, "INVALID_WINDOW", "The end date must not precede the start date.");
  }
}

export async function createDiscount(dto: DiscountCreateDto, actorId: number): Promise<DiscountDto> {
  const scope = dto.scope ?? "SUBSCRIPTION";
  validateValues({ discountType: dto.discountType, value: dto.value, startsAt: dto.startsAt, endsAt: dto.endsAt });
  const productIds =
    scope === "PRODUCTS" ? [...new Set(dto.productIds ?? [])] : [];
  if (scope === "PRODUCTS") {
    await assertProductsExist(productIds);
  }
  const { starts, ends } = normalizeWindow(dto.startsAt, dto.endsAt);
  try {
    const created = await withTransaction(async (connection) => {
      const [result] = await connection.execute(
        `INSERT INTO discount_rules
         (name, discount_type, value, minimum_purchase, minimum_quantity, starts_at, ends_at,
          usage_limit, usage_count, scope, is_active, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 1, ?)`,
        [
          dto.name,
          dto.discountType,
          dto.value,
          dto.minimumPurchase ?? null,
          dto.minimumQuantity ?? null,
          starts,
          ends,
          dto.usageLimit ?? null,
          scope,
          actorId,
        ],
      );
      const ruleId = Number((result as ResultSetHeader).insertId);
      for (const productId of productIds) {
        await connection.execute(
          "INSERT INTO discount_products (discount_rule_id, product_id) VALUES (?, ?)",
          [ruleId, productId],
        );
      }
      return ruleId;
    });
    const discount = await getDiscountById(created);
    if (discount === null) {
      throw new AppError(500, "INTERNAL_ERROR", "Discount creation failed unexpectedly.");
    }
    return discount;
  } catch (error) {
    if (duplicateName(error)) {
      throw new AppError(409, "DISCOUNT_NAME_TAKEN", "A discount rule with that name already exists.");
    }
    throw error;
  }
}

export async function updateDiscount(id: number, dto: DiscountUpdateDto): Promise<DiscountDto> {
  const existing = await loadRow(id);
  if (existing === null) {
    throw new AppError(404, "DISCOUNT_NOT_FOUND", `Discount ${id} does not exist.`);
  }
  const merged = {
    discountType: existing.discount_type,
    value: dto.value ?? existing.value,
    startsAt: dto.startsAt === undefined ? existing.starts_at?.slice(0, 10) ?? null : dto.startsAt,
    endsAt: dto.endsAt === undefined ? existing.ends_at?.slice(0, 10) ?? null : dto.endsAt,
  };
  validateValues(merged);

  const scope = dto.scope !== undefined ? dto.scope : existing.scope;
  const productIds = dto.productIds === undefined ? undefined : [...new Set(dto.productIds)];
  if (scope === "PRODUCTS") {
    if (productIds !== undefined) {
      await assertProductsExist(productIds);
    } else if (existing.scope !== "PRODUCTS") {
      throw new AppError(400, "PRODUCT_IDS_REQUIRED", "Switching to PRODUCTS scope needs the scoped product ids.");
    }
  }

  const window = normalizeWindow(merged.startsAt, merged.endsAt);
  try {
    await withTransaction(async (connection) => {
      await connection.execute(
        `UPDATE discount_rules SET
           name = COALESCE(?, name),
           value = ?,
           minimum_purchase = ?,
           minimum_quantity = ?,
           starts_at = ?,
           ends_at = ?,
           usage_limit = ?,
           is_active = ?,
           scope = ?
         WHERE id = ?`,
        [
          dto.name ?? null,
          merged.value,
          dto.minimumPurchase === undefined ? existing.minimum_purchase : dto.minimumPurchase,
          dto.minimumQuantity === undefined ? existing.minimum_quantity : dto.minimumQuantity,
          window.starts,
          window.ends,
          dto.usageLimit === undefined ? existing.usage_limit : dto.usageLimit,
          dto.isActive === undefined ? existing.is_active : dto.isActive ? 1 : 0,
          scope,
          id,
        ],
      );
      if (scope === "PRODUCTS" && productIds !== undefined) {
        await connection.execute("DELETE FROM discount_products WHERE discount_rule_id = ?", [id]);
        for (const productId of productIds) {
          await connection.execute(
            "INSERT INTO discount_products (discount_rule_id, product_id) VALUES (?, ?)",
            [id, productId],
          );
        }
      }
      if (scope === "SUBSCRIPTION") {
        await connection.execute("DELETE FROM discount_products WHERE discount_rule_id = ?", [id]);
      }
    });
  } catch (error) {
    if (duplicateName(error)) {
      throw new AppError(409, "DISCOUNT_NAME_TAKEN", "A discount rule with that name already exists.");
    }
    throw error;
  }
  const discount = await getDiscountById(id);
  if (discount === null) {
    throw new AppError(500, "INTERNAL_ERROR", "Discount update failed unexpectedly.");
  }
  return discount;
}

/**
 * Consumption primitive used inside the billing transaction: bumps
 * usage_count only when the limit allows, so two concurrent invoices can
 * never exceed usage_limit. Returns true when the use was redeemed.
 */
export async function consumeDiscountUse(connection: PoolConnection, ruleId: number): Promise<boolean> {
  const [result] = await connection.execute(
    `UPDATE discount_rules
     SET usage_count = usage_count + 1
    WHERE id = ? AND is_active = 1 AND (usage_limit IS NULL OR usage_count < usage_limit)`,
    [ruleId],
  );
  return Number((result as ResultSetHeader).affectedRows) === 1;
}
