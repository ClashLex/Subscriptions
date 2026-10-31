import { RowDataPacket } from "mysql2/promise";
import { AppError } from "../../middleware/errors.js";
import { query, withTransaction } from "../../config/db.js";
import { addMoney } from "../../lib/money.js";
import { getProductById, listVariantsForProduct } from "../products/products.service.js";
import { getTaxById } from "../taxes/taxes.service.js";
import { getPlanById } from "../plans/plans.service.js";
import type { TemplateItemInput, TemplateCreateDto, TemplateUpdateDto } from "./quotations.schemas.js";

export interface TemplateRow extends RowDataPacket {
  id: number;
  name: string;
  validity_days: number;
  default_plan_id: number | null;
  created_by: number | null;
}

export interface TemplateItemRow extends RowDataPacket {
  id: number;
  template_id: number;
  product_id: number;
  variant_id: number | null;
  quantity: number;
  unit_price: string;
  tax_id: number | null;
}

export interface TemplateItemDto {
  productId: number;
  variantId: number | null;
  productName: string;
  variantName: string | null;
  quantity: number;
  unitPrice: string;
  taxId: number | null;
  taxName: string | null;
}

export interface TemplateDto {
  id: number;
  name: string;
  validityDays: number;
  defaultPlanId: number | null;
  defaultPlanName: string | null;
  items: TemplateItemDto[];
}

function toTemplateDto(row: TemplateRow, items: TemplateItemDto[], defaultPlanName: string | null): TemplateDto {
  return {
    id: row.id,
    name: row.name,
    validityDays: row.validity_days,
    defaultPlanId: row.default_plan_id,
    defaultPlanName,
    items,
  };
}

/**
 * Resolves each template item against the current catalogue and snapshots the
 * unit price (variant effective price when a variant is referenced). Catalogue
 * changes later must not rewrite stored quotation snapshots.
 */
async function resolveItemInputs(inputs: TemplateItemInput[]): Promise<TemplateItemDto[]> {
  const products = new Map<number, { name: string; salesPrice: string }>();
  const items: TemplateItemDto[] = [];
  for (const input of inputs) {
    let product = products.get(input.productId);
    if (product === undefined) {
      const row = await getProductById(input.productId);
      if (!row) {
        throw new AppError(404, "PRODUCT_NOT_FOUND", `Product ${input.productId} does not exist.`);
      }
      if (row.is_active === 0) {
        throw new AppError(400, "PRODUCT_NOT_ACTIVE", `Product ${row.name} is not active.`);
      }
      product = { name: row.name, salesPrice: row.sales_price };
      products.set(input.productId, product);
    }
    let variantName: string | null = null;
    let unitPrice = product.salesPrice;
    if (input.variantId !== undefined) {
      const variants = await listVariantsForProduct(input.productId);
      const variant = variants.find((row) => row.id === input.variantId);
      if (!variant) {
        throw new AppError(404, "VARIANT_NOT_FOUND", `Variant ${input.variantId} does not belong to product ${input.productId}.`);
      }
      if (variant.is_active === 0) {
        throw new AppError(400, "VARIANT_NOT_ACTIVE", `Variant ${variant.name} is not active.`);
      }
      variantName = variant.name;
      unitPrice = addMoney(product.salesPrice, variant.price_adjustment);
    }
    let taxId: number | null = null;
    let taxName: string | null = null;
    if (input.taxId !== undefined) {
      const tax = await getTaxById(input.taxId);
      if (!tax || tax.is_active === 0) {
        throw new AppError(400, "TAX_NOT_AVAILABLE", `Tax rule ${input.taxId} does not exist or is inactive.`);
      }
      taxId = tax.id;
      taxName = tax.name;
    }
    items.push({
      productId: input.productId,
      variantId: input.variantId ?? null,
      productName: product.name,
      variantName,
      quantity: input.quantity,
      unitPrice,
      taxId,
      taxName,
    });
  }
  return items;
}

async function loadDefaultPlanName(planId: number | null): Promise<string | null> {
  if (planId === null) {
    return null;
  }
  const plan = await getPlanById(planId);
  return plan?.name ?? null;
}

async function loadItems(templateId: number): Promise<TemplateItemDto[]> {
  const rows = await query<TemplateItemRow[]>(
    `SELECT i.id, i.template_id, i.product_id, i.variant_id, i.quantity, i.unit_price, i.tax_id,
            p.name AS product_name, v.name AS variant_name, t.name AS tax_name
     FROM quotation_template_items i
     JOIN products p ON p.id = i.product_id
     LEFT JOIN product_variants v ON v.id = i.variant_id
     LEFT JOIN taxes t ON t.id = i.tax_id
     WHERE i.template_id = ? ORDER BY i.id`,
    [templateId],
  );
  return rows.map((row) => ({
    productId: row.product_id,
    variantId: row.variant_id,
    productName: row.product_name,
    variantName: row.variant_name,
    quantity: row.quantity,
    unitPrice: row.unit_price,
    taxId: row.tax_id,
    taxName: row.tax_name,
  }));
}

export async function listTemplates(options: { limit: number; offset: number }): Promise<{
  rows: TemplateDto[];
  total: number;
}> {
  const rows = await query<TemplateRow[]>(
    `SELECT id, name, validity_days, default_plan_id, created_by
     FROM quotation_templates ORDER BY id DESC LIMIT ? OFFSET ?`,
    [options.limit, options.offset],
  );
  const countRows = await query<Array<RowDataPacket & { total: number }>>(
    "SELECT COUNT(*) AS total FROM quotation_templates",
  );
  const templates: TemplateDto[] = [];
  for (const row of rows) {
    templates.push(toTemplateDto(row, await loadItems(row.id), await loadDefaultPlanName(row.default_plan_id)));
  }
  return { rows: templates, total: Number(countRows[0]?.total ?? 0) };
}

export async function getTemplateById(id: number): Promise<TemplateDto | null> {
  const rows = await query<TemplateRow[]>(
    "SELECT id, name, validity_days, default_plan_id, created_by FROM quotation_templates WHERE id = ? LIMIT 1",
    [id],
  );
  const row = rows[0];
  if (!row) {
    return null;
  }
  return toTemplateDto(row, await loadItems(row.id), await loadDefaultPlanName(row.default_plan_id));
}

async function validateDefaultPlan(planId: number | null): Promise<void> {
  if (planId === null) {
    return;
  }
  const plan = await getPlanById(planId);
  if (!plan) {
    throw new AppError(404, "PLAN_NOT_FOUND", `Plan ${planId} does not exist.`);
  }
}

export async function createTemplate(dto: TemplateCreateDto, createdBy: number): Promise<TemplateDto> {
  const items = await resolveItemInputs(dto.items);
  if (dto.defaultPlanId !== undefined) {
    await validateDefaultPlan(dto.defaultPlanId);
  }
  try {
    const created = await withTransaction(async (connection) => {
      const [result] = await connection.execute(
        `INSERT INTO quotation_templates (name, validity_days, default_plan_id, created_by)
         VALUES (?, ?, ?, ?)`,
        [dto.name, dto.validityDays ?? 15, dto.defaultPlanId ?? null, createdBy],
      );
      const templateId = Number((result as { insertId: number }).insertId);
      for (const item of items) {
        await connection.execute(
          `INSERT INTO quotation_template_items
           (template_id, product_id, variant_id, quantity, unit_price, tax_id)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [templateId, item.productId, item.variantId, item.quantity, item.unitPrice, item.taxId],
        );
      }
      return templateId;
    });
    const template = await getTemplateById(created);
    if (!template) {
      throw new AppError(500, "INTERNAL_ERROR", "Template creation failed unexpectedly.");
    }
    return template;
  } catch (error) {
    if (typeof error === "object" && error !== null && (error as { code?: string }).code === "ER_DUP_ENTRY") {
      throw new AppError(409, "TEMPLATE_NAME_TAKEN", "A quotation template with that name already exists.");
    }
    throw error;
  }
}

export async function updateTemplate(id: number, dto: TemplateUpdateDto): Promise<TemplateDto> {
  const existing = await getTemplateById(id);
  if (!existing) {
    throw new AppError(404, "NOT_FOUND", "Quotation template not found.");
  }
  if (dto.defaultPlanId !== undefined && dto.defaultPlanId !== null) {
    await validateDefaultPlan(dto.defaultPlanId);
  }
  try {
    await withTransaction(async (connection) => {
      if (dto.name !== undefined) {
        await connection.execute("UPDATE quotation_templates SET name = ? WHERE id = ?", [dto.name, id]);
      }
      if (dto.validityDays !== undefined) {
        await connection.execute("UPDATE quotation_templates SET validity_days = ? WHERE id = ?", [dto.validityDays, id]);
      }
      if (dto.defaultPlanId !== undefined) {
        await connection.execute("UPDATE quotation_templates SET default_plan_id = ? WHERE id = ?", [dto.defaultPlanId, id]);
      }
      if (dto.items !== undefined) {
        // Items are replaced wholesale; unit prices re-snapshot from the catalogue.
        const items = await resolveItemInputs(dto.items);
        await connection.execute("DELETE FROM quotation_template_items WHERE template_id = ?", [id]);
        for (const item of items) {
          await connection.execute(
            `INSERT INTO quotation_template_items (template_id, product_id, variant_id, quantity, unit_price, tax_id)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [id, item.productId, item.variantId, item.quantity, item.unitPrice, item.taxId],
          );
        }
      }
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && (error as { code?: string }).code === "ER_DUP_ENTRY") {
      throw new AppError(409, "TEMPLATE_NAME_TAKEN", "A quotation template with that name already exists.");
    }
    throw error;
  }
  const updated = await getTemplateById(id);
  if (!updated) {
    throw new AppError(500, "INTERNAL_ERROR", "Template update failed unexpectedly.");
  }
  return updated;
}
