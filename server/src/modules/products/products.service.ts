import { RowDataPacket } from "mysql2/promise";
import { AppError } from "../../middleware/errors.js";
import { query, execute, withTransaction } from "../../config/db.js";
import { addMoney, toCents } from "../../lib/money.js";
import type { ProductCreateDto, ProductUpdateDto, VariantCreateDto, VariantUpdateDto } from "./products.schemas.js";

export interface ProductRow extends RowDataPacket {
  id: number;
  name: string;
  type: string;
  sales_price: string;
  cost_price: string;
  notes: string | null;
  is_active: 0 | 1;
  variant_count: number;
}

export interface VariantRow extends RowDataPacket {
  id: number;
  product_id: number;
  name: string;
  price_adjustment: string;
  is_active: 0 | 1;
}

export interface ProductDto {
  id: number;
  name: string;
  type: string;
  salesPrice: string;
  costPrice: string;
  notes: string | null;
  isActive: boolean;
  variantCount: number;
}

export interface VariantDto {
  id: number;
  productId: number;
  name: string;
  priceAdjustment: string;
  isActive: boolean;
  effectivePrice: string;
}

export function toVariantDto(row: VariantRow, basePrice: string): VariantDto {
  return {
    id: row.id,
    productId: row.product_id,
    name: row.name,
    priceAdjustment: row.price_adjustment,
    isActive: row.is_active === 1,
    effectivePrice: addMoney(basePrice, row.price_adjustment),
  };
}

export async function listProducts(options: {
  search?: string;
  includeInactive?: boolean;
  limit: number;
  offset: number;
}): Promise<{ rows: ProductRow[]; total: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (!options.includeInactive) {
    conditions.push("p.is_active = 1");
  }
  if (options.search) {
    conditions.push("(p.name LIKE ? OR p.type LIKE ?)");
    params.push(`%${options.search}%`, `%${options.search}%`);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = await query<ProductRow[]>(
    `SELECT p.id, p.name, p.type, p.sales_price, p.cost_price, p.notes, p.is_active,
            COUNT(v.id) AS variant_count
     FROM products p LEFT JOIN product_variants v ON v.product_id = p.id AND v.is_active = 1
     ${where}
     GROUP BY p.id ORDER BY p.name LIMIT ? OFFSET ?`,
    [...params, options.limit, options.offset],
  );
  const countRows = await query<Array<RowDataPacket & { total: number }>>(
    `SELECT COUNT(*) AS total FROM products p ${where}`,
    params,
  );
  return { rows, total: Number(countRows[0]?.total ?? 0) };
}

export async function getProductById(id: number): Promise<ProductRow | null> {
  const rows = await query<ProductRow[]>(
    `SELECT p.id, p.name, p.type, p.sales_price, p.cost_price, p.notes, p.is_active,
            COUNT(v.id) AS variant_count
     FROM products p LEFT JOIN product_variants v ON v.product_id = p.id AND v.is_active = 1
     WHERE p.id = ? GROUP BY p.id LIMIT 1`,
    [id],
  );
  return rows[0] ?? null;
}

export function toProductDto(row: ProductRow): ProductDto {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    salesPrice: row.sales_price,
    costPrice: row.cost_price,
    notes: row.notes,
    isActive: row.is_active === 1,
    variantCount: Number(row.variant_count ?? 0),
  };
}

export async function listVariantsForProduct(productId: number): Promise<VariantRow[]> {
  return query<VariantRow[]>(
    "SELECT id, product_id, name, price_adjustment, is_active FROM product_variants WHERE product_id = ? ORDER BY name",
    [productId],
  );
}

export async function createProduct(dto: ProductCreateDto): Promise<ProductRow> {
  const result = await execute(
    `INSERT INTO products (name, type, sales_price, cost_price, notes, is_active)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [dto.name, dto.type, dto.salesPrice, dto.costPrice, dto.notes ?? null, dto.isActive === false ? 0 : 1],
  );
  const created = await getProductById(Number(result.insertId));
  if (!created) {
    throw new AppError(500, "INTERNAL_ERROR", "Product creation failed unexpectedly.");
  }
  return created;
}

export async function updateProduct(id: number, dto: ProductUpdateDto): Promise<ProductRow> {
  const existing = await getProductById(id);
  if (!existing) {
    throw new AppError(404, "NOT_FOUND", "Product not found.");
  }
  const nextSalesPrice = dto.salesPrice ?? existing.sales_price;
  for (const variant of await listVariantsForProduct(id)) {
    assertEffectivePriceNotNegative(nextSalesPrice, variant.price_adjustment);
  }
  await execute(
    `UPDATE products SET name = ?, type = ?, sales_price = ?, cost_price = ?, notes = ?, is_active = ? WHERE id = ?`,
    [
      dto.name ?? existing.name,
      dto.type ?? existing.type,
      nextSalesPrice,
      dto.costPrice ?? existing.cost_price,
      dto.notes === undefined ? existing.notes : dto.notes,
      (dto.isActive === undefined ? existing.is_active === 1 : dto.isActive) ? 1 : 0,
      id,
    ],
  );
  const updated = await getProductById(id);
  if (!updated) {
    throw new AppError(500, "INTERNAL_ERROR", "Product update failed unexpectedly.");
  }
  return updated;
}

/** Guarantees a variant row of this exact product exists; otherwise 404. */
async function getVariantOfProduct(productId: number, variantId: number): Promise<VariantRow> {
  const rows = await query<VariantRow[]>(
    "SELECT id, product_id, name, price_adjustment, is_active FROM product_variants WHERE id = ? AND product_id = ? LIMIT 1",
    [variantId, productId],
  );
  const row = rows[0];
  if (!row) {
    throw new AppError(404, "NOT_FOUND", "Variant not found for this product.");
  }
  return row;
}

function assertEffectivePriceNotNegative(basePrice: string, adjustment: string): void {
  if (toCents(basePrice) + toCents(adjustment) < 0n) {
    throw new AppError(
      400,
      "EFFECTIVE_PRICE_NOT_ALLOWED",
      "The effective price (product price plus variant adjustment) cannot be negative.",
    );
  }
}

export async function createVariant(productId: number, dto: VariantCreateDto): Promise<VariantDto> {
  const product = await getProductById(productId);
  if (!product) {
    throw new AppError(404, "NOT_FOUND", "Product not found.");
  }
  assertEffectivePriceNotNegative(product.sales_price, dto.priceAdjustment);
  try {
    await withTransaction(async (connection) => {
      await connection.execute(
        "INSERT INTO product_variants (product_id, name, price_adjustment) VALUES (?, ?, ?)",
        [productId, dto.name, dto.priceAdjustment],
      );
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && (error as { code?: string }).code === "ER_DUP_ENTRY") {
      throw new AppError(409, "VARIANT_NAME_TAKEN", "A variant with that name already exists on this product.");
    }
    throw error;
  }
  const rows = await query<VariantRow[]>(
    "SELECT id, product_id, name, price_adjustment, is_active FROM product_variants WHERE product_id = ? AND name = ? ORDER BY id DESC LIMIT 1",
    [productId, dto.name],
  );
  const created = rows[0];
  if (!created) {
    throw new AppError(500, "INTERNAL_ERROR", "Variant creation failed unexpectedly.");
  }
  return toVariantDto(created, product.sales_price);
}

export async function updateVariant(
  productId: number,
  variantId: number,
  dto: VariantUpdateDto,
): Promise<VariantDto> {
  const product = await getProductById(productId);
  if (!product) {
    throw new AppError(404, "NOT_FOUND", "Product not found.");
  }
  const variant = await getVariantOfProduct(productId, variantId);
  const nextAdjustment = dto.priceAdjustment ?? variant.price_adjustment;
  const nextName = dto.name ?? variant.name;
  const nextActive = dto.isActive === undefined ? variant.is_active === 1 : dto.isActive;
  assertEffectivePriceNotNegative(product.sales_price, nextAdjustment);
  try {
    await execute(
      "UPDATE product_variants SET name = ?, price_adjustment = ?, is_active = ? WHERE id = ? AND product_id = ?",
      [nextName, nextAdjustment, nextActive ? 1 : 0, variantId, productId],
    );
  } catch (error) {
    if (typeof error === "object" && error !== null && (error as { code?: string }).code === "ER_DUP_ENTRY") {
      throw new AppError(409, "VARIANT_NAME_TAKEN", "A variant with that name already exists on this product.");
    }
    throw error;
  }
  const refreshed = await getVariantOfProduct(productId, variantId);
  return toVariantDto(refreshed, product.sales_price);
}
