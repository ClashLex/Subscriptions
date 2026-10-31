import { RowDataPacket } from "mysql2/promise";
import { AppError } from "../../middleware/errors.js";
import { query, execute } from "../../config/db.js";
import type { TaxCreateDto, TaxUpdateDto } from "./taxes.schemas.js";

export interface TaxRow extends RowDataPacket {
  id: number;
  name: string;
  rate: string;
  tax_mode: "EXCLUSIVE" | "INCLUSIVE";
  is_active: 0 | 1;
}

export interface TaxDto {
  id: number;
  name: string;
  rate: string;
  taxMode: "EXCLUSIVE" | "INCLUSIVE";
  isActive: boolean;
}

export function toTaxDto(row: TaxRow): TaxDto {
  return {
    id: row.id,
    name: row.name,
    rate: row.rate,
    taxMode: row.tax_mode,
    isActive: row.is_active === 1,
  };
}

export async function listTaxes(): Promise<TaxRow[]> {
  return query<TaxRow[]>(
    "SELECT id, name, rate, tax_mode, is_active FROM taxes ORDER BY name",
  );
}

export async function getTaxById(id: number): Promise<TaxRow | null> {
  const rows = await query<TaxRow[]>(
    "SELECT id, name, rate, tax_mode, is_active FROM taxes WHERE id = ? LIMIT 1",
    [id],
  );
  return rows[0] ?? null;
}

export async function createTax(dto: TaxCreateDto): Promise<TaxRow> {
  try {
    const result = await execute(
      "INSERT INTO taxes (name, rate, tax_mode) VALUES (?, ?, ?)",
      [dto.name, dto.rate, dto.taxMode ?? "EXCLUSIVE"],
    );
    const created = await getTaxById(Number(result.insertId));
    if (!created) {
      throw new AppError(500, "INTERNAL_ERROR", "Tax creation failed unexpectedly.");
    }
    return created;
  } catch (error) {
    if (typeof error === "object" && error !== null && (error as { code?: string }).code === "ER_DUP_ENTRY") {
      throw new AppError(409, "TAX_NAME_TAKEN", "A tax rule with that name already exists.");
    }
    throw error;
  }
}

export async function updateTax(id: number, dto: TaxUpdateDto): Promise<TaxRow> {
  const existing = await getTaxById(id);
  if (!existing) {
    throw new AppError(404, "NOT_FOUND", "Tax rule not found.");
  }
  await execute(
    "UPDATE taxes SET name = ?, rate = ?, tax_mode = ?, is_active = ? WHERE id = ?",
    [
      dto.name ?? existing.name,
      dto.rate ?? existing.rate,
      dto.taxMode ?? existing.tax_mode,
      (dto.isActive === undefined ? existing.is_active === 1 : dto.isActive) ? 1 : 0,
      id,
    ],
  );
  const updated = await getTaxById(id);
  if (!updated) {
    throw new AppError(500, "INTERNAL_ERROR", "Tax update failed unexpectedly.");
  }
  return updated;
}
