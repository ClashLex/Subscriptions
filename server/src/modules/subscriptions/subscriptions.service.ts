import { RowDataPacket, type PoolConnection, ResultSetHeader } from "mysql2/promise";
import { AppError } from "../../middleware/errors.js";
import { query, execute, withTransaction } from "../../config/db.js";import { addMoney, multiplyMoney, inclusiveTaxComponent, percentOf, toCents } from "../../lib/money.js";
import { todayIso, addDaysIso, parseUtc, mysqlUtc } from "../../lib/dates.js";
import { getProductById, listVariantsForProduct } from "../products/products.service.js";
import { getTaxById } from "../taxes/taxes.service.js";
import { getPlanById, type PlanRow } from "../plans/plans.service.js";
import type {
  SubscriptionCreateDto,
  SubscriptionUpdateDto,
  SubscriptionLineInput,
} from "./subscriptions.schemas.js";

export type SubscriptionStatus = "DRAFT" | "QUOTATION" | "CONFIRMED" | "ACTIVE" | "PAUSED" | "CLOSED";

export interface SubscriptionRow extends RowDataPacket {
  id: number;
  subscription_number: string;
  customer_id: number;
  plan_id: number;
  quotation_template_id: number | null;
  status: SubscriptionStatus;
  start_date: string | null;
  expiry_date: string | null;
  quotation_valid_until: string | null;
  payment_terms_days: number;
  next_billing_at: string | null;
  previous_subscription_id: number | null;
  paused_at: string | null;
  closed_at: string | null;
  created_by: number | null;
}

export interface SubscriptionLineRow extends RowDataPacket {
  id: number;
  subscription_id: number;
  product_id: number | null;
  variant_id: number | null;
  description_snapshot: string;
  quantity: number;
  unit_price: string;
  tax_id: number | null;
  tax_name_snapshot: string | null;
  tax_rate_snapshot: string | null;
  tax_mode_snapshot: "EXCLUSIVE" | "INCLUSIVE" | null;
  line_amount: string;
}

export interface SubscriptionEventRow extends RowDataPacket {
  id: number;
  subscription_id: number;
  actor_email: string | null;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  reason: string | null;
  created_at: string;
}

export interface SubscriptionListRow extends RowDataPacket {
  id: number;
  subscription_number: string;
  customer_id: number;
  customer_email: string;
  plan_id: number;
  plan_name: string;
  status: SubscriptionStatus;
  start_date: string | null;
  expiry_date: string | null;
  next_billing_at: string | null;
  previous_subscription_id: number | null;
}

/** Client-facing camelCase DTO for list rows (same shape as the UI types). */
export function listRowDto(row: SubscriptionListRow) {
  return {
    id: row.id,
    subscriptionNumber: row.subscription_number,
    customerId: row.customer_id,
    customerEmail: row.customer_email,
    planId: row.plan_id,
    planName: row.plan_name,
    status: row.status,
    startDate: row.start_date,
    expiryDate: row.expiry_date,
    nextBillingAt: row.next_billing_at,
    previousSubscriptionId: row.previous_subscription_id,
  };
}

// ---------------------------------------------------------------------------
// Shared DTO helpers
// ---------------------------------------------------------------------------

export function subscriptionNumber(id: number): string {
  return `SUB-${String(id).padStart(6, "0")}`;
}

export interface SubscriptionTotals {
  subtotal: string;
  taxTotal: string;
  total: string;
}

// ---------------------------------------------------------------------------

function lineDto(line: SubscriptionLineRow) {
  return {
    id: line.id,
    productId: line.product_id,
    variantId: line.variant_id,
    description: line.description_snapshot,
    quantity: line.quantity,
    unitPrice: line.unit_price,
    lineAmount: line.line_amount,
    taxId: line.tax_id,
    taxName: line.tax_name_snapshot,
    taxRate: line.tax_rate_snapshot,
    taxMode: line.tax_mode_snapshot,
  };
}

function eventDto(row: SubscriptionEventRow) {
  return {
    id: row.id,
    eventType: row.event_type,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    reason: row.reason,
    actorEmail: row.actor_email,
    createdAt: row.created_at,
  };
}

/**
 * Resolves line inputs against the catalogue and produces snapshot rows.
 * Unit price = variant effective price when a variant is referenced,
 * otherwise the product's sales price — except where an agreed price is
 * carried in (template items keep their snapshot price from template save).
 * Client-claimed prices on direct lines are ignored entirely.
 */
async function resolveCatalogueLines(
  inputs: Array<SubscriptionLineInput & { unitPrice?: string }>,
): Promise<Array<{
  productId: number | null;
  variantId: number | null;
  descriptionSnapshot: string;
  quantity: number;
  unitPrice: string;
  taxId: number | null;
  lineAmount: string;
}>> {
  const productCache = new Map<number, { name: string; salesPrice: string }>();
  const resolved: Array<{
    productId: number | null;
    variantId: number | null;
    descriptionSnapshot: string;
    quantity: number;
    unitPrice: string;
    taxId: number | null;
    lineAmount: string;
  }> = [];
  for (const input of inputs) {
    let product = productCache.get(input.productId);
    if (product === undefined) {
      const row = await getProductById(input.productId);
      if (!row) {
        throw new AppError(404, "PRODUCT_NOT_FOUND", `Product ${input.productId} does not exist.`);
      }
      // Templates may already have stored-agreed prices; only direct lines
      // require an active product because their price comes from the catalogue.
      if (row.is_active === 0 && input.unitPrice === undefined) {
        throw new AppError(400, "PRODUCT_NOT_ACTIVE", `Product ${row.name} is not active.`);
      }
      product = { name: row.name, salesPrice: row.sales_price };
      productCache.set(input.productId, product);
    }
    let variantId: number | null = null;
    let description = product.name;
    let unitPrice = product.salesPrice;
    if (input.variantId !== undefined) {
      const variants = await listVariantsForProduct(input.productId);
      const variant = variants.find((row) => row.id === input.variantId);
      if (!variant) {
        throw new AppError(404, "VARIANT_NOT_FOUND", `Variant ${input.variantId} does not belong to product ${input.productId}.`);
      }
      variantId = variant.id;
      description = `${product.name} — ${variant.name}`;
      unitPrice = input.unitPrice ?? addMoney(product.salesPrice, variant.price_adjustment);
    } else if (input.unitPrice !== undefined) {
      // Template-agreed price survives the catalogue changing underneath.
      unitPrice = input.unitPrice;
    }
    let taxId: number | null = null;
    if (input.taxId !== undefined) {
      const tax = await getTaxById(input.taxId);
      if (!tax || tax.is_active === 0) {
        throw new AppError(400, "TAX_NOT_AVAILABLE", `Tax rule ${input.taxId} does not exist or is inactive.`);
      }
      taxId = tax.id;
    }
    resolved.push({
      productId: input.productId,
      variantId,
      descriptionSnapshot: description,
      quantity: input.quantity,
      unitPrice,
      taxId,
      lineAmount: multiplyMoney(unitPrice, input.quantity),
    });
  }
  return resolved;
}

async function insertSubscriptionLines(
  connection: PoolConnection,
  subscriptionId: number,
  lines: Awaited<ReturnType<typeof resolveCatalogueLines>>,
): Promise<void> {
  for (const line of lines) {
    let taxSnapshot: { name: string | null; rate: string | null; mode: "EXCLUSIVE" | "INCLUSIVE" | null } = {
      name: null,
      rate: null,
      mode: null,
    };
    if (line.taxId !== null) {
      const tax = await getTaxById(line.taxId);
      if (tax) {
        taxSnapshot = { name: tax.name, rate: tax.rate, mode: tax.tax_mode };
      }
    }
    await connection.execute(
      `INSERT INTO subscription_lines
       (subscription_id, product_id, variant_id, description_snapshot, quantity, unit_price,
        tax_id, tax_name_snapshot, tax_rate_snapshot, tax_mode_snapshot, line_amount)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        subscriptionId,
        line.productId,
        line.variantId,
        line.descriptionSnapshot,
        line.quantity,
        line.unitPrice,
        line.taxId,
        taxSnapshot.name,
        taxSnapshot.rate,
        taxSnapshot.mode,
        line.lineAmount,
      ],
    );
  }
}

export async function recordEvent(
  connection: PoolConnection | null,
  subscriptionId: number,
  actorId: number | null,
  eventType: string,
  fromStatus: SubscriptionStatus | null,
  toStatus: SubscriptionStatus | null,
  reason?: string,
): Promise<void> {
  const sql = `INSERT INTO subscription_events
    (subscription_id, actor_user_id, event_type, from_status, to_status, reason)
    VALUES (?, ?, ?, ?, ?, ?)`;
  const params = [subscriptionId, actorId, eventType, fromStatus, toStatus, reason ?? null];
  if (connection) {
    await connection.execute(sql, params);
  } else {
    await execute(sql, params);
  }
}

/** Deterministic unique number: insert with a throwaway token, then stamp. */
async function insertSubscription(
  connection: PoolConnection,
  header: {
    customerId: number;
    planId: number;
    templateId: number | null;
    startDate: string | null;
    expiryDate: string | null;
    paymentTermsDays: number;
    createdBy: number | null;
    previousSubscriptionId: number | null;
  },
): Promise<number> {
  const [result] = await connection.execute(
    `INSERT INTO subscriptions
     (subscription_number, customer_id, plan_id, quotation_template_id, start_date,
      expiry_date, payment_terms_days, previous_subscription_id, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      `TMP-${Math.floor(Math.random() * 1e12)}-${header.customerId}`,
      header.customerId,
      header.planId,
      header.templateId,
      header.startDate,
      header.expiryDate,
      header.paymentTermsDays,
      header.previousSubscriptionId,
      header.createdBy,
    ],
  );
  const id = Number((result as ResultSetHeader).insertId);
  await connection.execute(
    "UPDATE subscriptions SET subscription_number = ? WHERE id = ?",
    [subscriptionNumber(id), id],
  );
  return id;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

async function loadLines(subscriptionId: number): Promise<SubscriptionLineRow[]> {
  return query<SubscriptionLineRow[]>(
    `SELECT id, subscription_id, product_id, variant_id, description_snapshot, quantity,
            unit_price, tax_id, tax_name_snapshot, tax_rate_snapshot, tax_mode_snapshot, line_amount
     FROM subscription_lines WHERE subscription_id = ? ORDER BY id`,
    [subscriptionId],
  );
}

/**
 * Locks one subscription row for a lifecycle transition. Every state change
 * reads and writes under this lock so two concurrent requests cannot both
 * pass the same transition guard.
 */
async function lockSubscription(
  connection: PoolConnection,
  id: number,
): Promise<SubscriptionRow> {
  const [rows] = await connection.execute(
    "SELECT * FROM subscriptions WHERE id = ? LIMIT 1 FOR UPDATE",
    [id],
  );
  const row = (rows as SubscriptionRow[])[0];
  if (!row) {
    throw new AppError(404, "NOT_FOUND", "Subscription not found.");
  }
  return row;
}

async function loadLinesWith(
  connection: PoolConnection,
  subscriptionId: number,
): Promise<SubscriptionLineRow[]> {
  const [rows] = await connection.execute(
    `SELECT id, subscription_id, product_id, variant_id, description_snapshot, quantity,
            unit_price, tax_id, tax_name_snapshot, tax_rate_snapshot, tax_mode_snapshot, line_amount
     FROM subscription_lines WHERE subscription_id = ? ORDER BY id`,
    [subscriptionId],
  );
  return rows as SubscriptionLineRow[];
}

/**
 * Copies already-snapshotted lines onto a new subscription. Renewals use this
 * so the agreed price and tax snapshot survive catalogue edits or deletions; a
 * deleted product must not block renewal (product_id is simply preserved as
 * the stored foreign key, NULL once the catalogue row is gone).
 */
async function insertSnapshotLines(
  connection: PoolConnection,
  subscriptionId: number,
  lines: SubscriptionLineRow[],
): Promise<void> {
  for (const line of lines) {
    await connection.execute(
      `INSERT INTO subscription_lines
       (subscription_id, product_id, variant_id, description_snapshot, quantity, unit_price,
        tax_id, tax_name_snapshot, tax_rate_snapshot, tax_mode_snapshot, line_amount)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        subscriptionId,
        line.product_id,
        line.variant_id,
        line.description_snapshot,
        line.quantity,
        line.unit_price,
        line.tax_id,
        line.tax_name_snapshot,
        line.tax_rate_snapshot,
        line.tax_mode_snapshot,
        line.line_amount,
      ],
    );
  }
}

async function loadEvents(subscriptionId: number): Promise<SubscriptionEventRow[]> {
  return query<SubscriptionEventRow[]>(
    `SELECT e.id, e.subscription_id, e.event_type, e.from_status, e.to_status, e.reason,
            e.created_at, a.email AS actor_email
     FROM subscription_events e
     LEFT JOIN users a ON a.id = e.actor_user_id
     WHERE e.subscription_id = ? ORDER BY e.id`,
    [subscriptionId],
  );
}

function cleanTotals(lines: SubscriptionLineRow[]): SubscriptionTotals {
  let subtotal = 0n;
  let taxTotal = 0n; // tax contained in the invoice (both modes)
  let exclusiveAdd = 0n; // only EXCLUSIVE taxes are added on top of the subtotal
  for (const line of lines) {
    subtotal += toCents(line.line_amount);
    if (line.tax_rate_snapshot === null) {
      continue;
    }
    if (line.tax_mode_snapshot === "EXCLUSIVE") {
      const tax = toCents(percentOf(line.line_amount, line.tax_rate_snapshot));
      taxTotal += tax;
      exclusiveAdd += tax;
    } else if (line.tax_mode_snapshot === "INCLUSIVE") {
      // Already inside line_amount; extracted for display only.
      taxTotal += toCents(inclusiveTaxComponent(line.line_amount, line.tax_rate_snapshot));
    }
  }
  return {
    subtotal: fromCentsSafe(subtotal),
    taxTotal: fromCentsSafe(taxTotal),
    total: fromCentsSafe(subtotal + exclusiveAdd),
  };
}

/** Decimal-string formatting without floats (mirror of lib/money.ts). */
function fromCentsSafe(cents: bigint): string {
  const negative = cents < 0n;
  const digits = (negative ? -cents : cents).toString().padStart(3, "0");
  return `${negative ? "-" : ""}${digits.slice(0, -2)}.${digits.slice(-2)}`;
}

export interface SubscriptionDetail {
  id: number;
  subscriptionNumber: string;
  customerId: number;
  customerEmail: string;
  planId: number;
  planName: string;
  billingIntervalUnit: PlanRow["billing_interval_unit"];
  billingIntervalCount: number;
  templateId: number | null;
  status: SubscriptionStatus;
  startDate: string | null;
  expiryDate: string | null;
  quotationValidUntil: string | null;
  paymentTermsDays: number;
  nextBillingAt: string | null;
  previousSubscriptionId: number | null;
  pausedAt: string | null;
  closedAt: string | null;
  allowPause: boolean;
  allowEarlyClose: boolean;
  allowRenewal: boolean;
  lines: ReturnType<typeof lineDto>[];
  events: ReturnType<typeof eventDto>[];
  totals: SubscriptionTotals;
}

export async function getSubscriptionDetail(id: number): Promise<SubscriptionDetail | null> {
  const rows = await query<
    Array<
      SubscriptionRow &
        RowDataPacket & {
          customer_email: string;
          plan_name: string;
          allow_pause: 0 | 1;
          allow_early_close: 0 | 1;
          allow_renewal: 0 | 1;
        }
    >
  >(
    `SELECT s.*, u.email AS customer_email, p.name AS plan_name,
            p.billing_interval_unit, p.billing_interval_count,
            p.allow_pause, p.allow_early_close, p.allow_renewal
     FROM subscriptions s
     JOIN users u ON u.id = s.customer_id
     JOIN plans p ON p.id = s.plan_id
     WHERE s.id = ? LIMIT 1`,
    [id],
  );
  const row = rows[0];
  if (!row) {
    return null;
  }
  const lines = await loadLines(id);
  const events = await loadEvents(id);
  return {
    id: row.id,
    subscriptionNumber: row.subscription_number,
    customerId: row.customer_id,
    customerEmail: row.customer_email,
    planId: row.plan_id,
    planName: row.plan_name,
    billingIntervalUnit: row.billing_interval_unit,
    billingIntervalCount: row.billing_interval_count,
    templateId: row.quotation_template_id,
    status: row.status,
    startDate: row.start_date,
    expiryDate: row.expiry_date,
    quotationValidUntil: row.quotation_valid_until,
    paymentTermsDays: row.payment_terms_days,
    nextBillingAt: row.next_billing_at,
    previousSubscriptionId: row.previous_subscription_id,
    pausedAt: row.paused_at,
    closedAt: row.closed_at,
    allowPause: row.allow_pause === 1,
    allowEarlyClose: row.allow_early_close === 1,
    allowRenewal: row.allow_renewal === 1,
    lines: lines.map(lineDto),
    events: events.map(eventDto),
    totals: cleanTotals(lines),
  };
}

export async function listSubscriptions(options: {
  limit: number;
  offset: number;
  status?: SubscriptionStatus;
  customerId?: number;
}): Promise<{ rows: ReturnType<typeof listRowDto>[]; total: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (options.status !== undefined) {
    conditions.push("s.status = ?");
    params.push(options.status);
  }
  if (options.customerId !== undefined) {
    conditions.push("s.customer_id = ?");
    params.push(options.customerId);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const rawRows = await query<SubscriptionListRow[]>(
    `SELECT s.id, s.subscription_number, s.customer_id, u.email AS customer_email,
            s.plan_id, p.name AS plan_name, s.status, s.start_date, s.expiry_date,
            s.next_billing_at, s.previous_subscription_id
     FROM subscriptions s
     JOIN users u ON u.id = s.customer_id
     JOIN plans p ON p.id = s.plan_id
     ${where}
     ORDER BY s.id DESC LIMIT ? OFFSET ?`,
    [...params, options.limit, options.offset],
  );
  const countRows = await query<Array<RowDataPacket & { total: number }>>(
    `SELECT COUNT(*) AS total FROM subscriptions s ${where}`,
    params,
  );
  return { rows: rawRows.map(listRowDto), total: Number(countRows[0]?.total ?? 0) };
}

// ---------------------------------------------------------------------------
// Creation and updates
// ---------------------------------------------------------------------------

async function requireCustomer(customerId: number): Promise<void> {
  const rows = await query<Array<RowDataPacket & { role: string; is_active: 0 | 1 }>>(
    "SELECT role, is_active FROM users WHERE id = ? LIMIT 1",
    [customerId],
  );
  const customer = rows[0];
  if (!customer) {
    throw new AppError(404, "CUSTOMER_NOT_FOUND", `Customer ${customerId} does not exist.`);
  }
  if (customer.role !== "CUSTOMER") {
    throw new AppError(400, "NOT_A_CUSTOMER", `User ${customerId} is not a customer account.`);
  }
  if (customer.is_active === 0) {
    throw new AppError(400, "CUSTOMER_INACTIVE", `Customer ${customerId} is deactivated.`);
  }
}

/**
 * Plan availability is judged against the subscription's start date — the
 * plan must be sellable on the day billing begins (REQUIREMENTS §2.3).
 */
function validatePlanAvailability(plan: PlanRow, startDate: string): void {
  if (plan.is_active === 0) {
    throw new AppError(400, "PLAN_NOT_ACTIVE", `Plan ${plan.name} is not active.`);
  }
  if (plan.available_from !== null && plan.available_from > startDate) {
    throw new AppError(400, "PLAN_NOT_AVAILABLE", `Plan ${plan.name} is not available from ${startDate}.`);
  }
  if (plan.available_until !== null && plan.available_until < startDate) {
    throw new AppError(400, "PLAN_NOT_AVAILABLE", `Plan ${plan.name} is no longer available on ${startDate}.`);
  }
}

function validateMinimumQuantity(plan: PlanRow, lines: Array<{ quantity: number }>): void {
  const totalQuantity = lines.reduce((sum, line) => sum + line.quantity, 0);
  if (totalQuantity < plan.minimum_quantity) {
    throw new AppError(
      400,
      "MINIMUM_QUANTITY_NOT_MET",
      `Plan ${plan.name} requires at least ${plan.minimum_quantity} unit(s); lines total ${totalQuantity}.`,
    );
  }
}

export async function createSubscription(
  dto: SubscriptionCreateDto,
  actorId: number,
): Promise<SubscriptionDetail> {
  const plan = await getPlanById(dto.planId);
  if (!plan) {
    throw new AppError(404, "PLAN_NOT_FOUND", `Plan ${dto.planId} does not exist.`);
  }
  await requireCustomer(dto.customerId);
  const startDate = dto.startDate ?? todayIso();
  validatePlanAvailability(plan, startDate);
  // An omitted contract end means an open-ended subscription that keeps
  // billing every interval until it is closed (the normal recurring case).
  const expiryDate = dto.expiryDate ?? null;
  if (expiryDate !== null && expiryDate <= startDate) {
    throw new AppError(
      400,
      "INVALID_CONTRACT_END",
      `The contract end (${expiryDate}) must be after the start date (${startDate}).`,
    );
  }

  let templateId: number | null = null;
  let lineInputs: Array<SubscriptionLineInput & { unitPrice?: string }>;

  if (dto.templateId !== undefined) {
    const templateRows = await query<Array<RowDataPacket & { validity_days: number }>>(
      "SELECT validity_days FROM quotation_templates WHERE id = ? LIMIT 1",
      [dto.templateId],
    );
    const template = templateRows[0];
    if (!template) {
      throw new AppError(404, "TEMPLATE_NOT_FOUND", `Quotation template ${dto.templateId} does not exist.`);
    }
    templateId = dto.templateId;
    const templateItems = await query<Array<RowDataPacket & {
      product_id: number;
      variant_id: number | null;
      quantity: number;
      unit_price: string;
      tax_id: number | null;
    }>>(
      `SELECT product_id, variant_id, quantity, unit_price, tax_id
       FROM quotation_template_items WHERE template_id = ? ORDER BY id`,
      [dto.templateId],
    );
    lineInputs = templateItems.map((item) => ({
      productId: item.product_id,
      variantId: item.variant_id ?? undefined,
      quantity: item.quantity,
      unitPrice: item.unit_price,
      taxId: item.tax_id ?? undefined,
    }));
  } else if (dto.lines) {
    lineInputs = dto.lines;
  } else {
    throw new AppError(400, "VALIDATION_ERROR", "Provide lines or a templateId.");
  }

  // Snaplines from a template carry the unit price agreed when the template
  // item was saved; direct lines always resolve the current catalogue price.
  const lines = await resolveCatalogueLines(lineInputs);
  validateMinimumQuantity(plan, lines);

  try {
    const id = await withTransaction(async (connection) => {
      const insertedId = await insertSubscription(connection, {
        customerId: dto.customerId,
        planId: dto.planId,
        templateId,
        startDate,
        expiryDate,
        paymentTermsDays: dto.paymentTermsDays ?? 0,
        createdBy: actorId,
        previousSubscriptionId: null,
      });
      await insertSubscriptionLines(connection, insertedId, lines);
      await recordEvent(connection, insertedId, actorId, "CREATED", null, "DRAFT", "Subscription created as a draft.");
      return insertedId;
    });
    const detail = await getSubscriptionDetail(id);
    if (!detail) {
      throw new AppError(500, "INTERNAL_ERROR", "Subscription creation failed unexpectedly.");
    }
    return detail;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    if (typeof error === "object" && error !== null && (error as { code?: string }).code === "ER_NO_REFERENCED_ROW_2") {
      throw new AppError(404, "NOT_FOUND", "Referenced record does not exist.");
    }
    throw error;
  }
}

export async function updateSubscription(
  id: number,
  dto: SubscriptionUpdateDto,
  actorId: number,
): Promise<SubscriptionDetail> {
  await withTransaction(async (connection) => {
    const subscription = await lockSubscription(connection, id);
    if (subscription.status !== "DRAFT" && subscription.status !== "QUOTATION") {
      throw new AppError(
        409,
        "INVALID_TRANSITION",
        `Subscription fields are frozen after confirmation (currently ${subscription.status}).`,
      );
    }

    const nextPlanId = dto.planId ?? subscription.plan_id;
    const nextStart = dto.startDate ?? subscription.start_date ?? todayIso();
    const plan = await getPlanById(nextPlanId);
    if (!plan) {
      throw new AppError(404, "PLAN_NOT_FOUND", `Plan ${nextPlanId} does not exist.`);
    }
    // A plan swap or a moved start date must still leave a sellable contract.
    if (dto.planId !== undefined || dto.startDate !== undefined) {
      validatePlanAvailability(plan, nextStart);
    }
    if (dto.expiryDate !== undefined && dto.expiryDate !== null && dto.expiryDate <= nextStart) {
      throw new AppError(
        400,
        "INVALID_CONTRACT_END",
        `The contract end (${dto.expiryDate}) must be after the start date (${nextStart}).`,
      );
    }

    const sets: string[] = [];
    const params: Array<string | number | null> = [];
    if (dto.startDate !== undefined) {
      sets.push("start_date = ?");
      params.push(dto.startDate);
    }
    if (dto.paymentTermsDays !== undefined) {
      sets.push("payment_terms_days = ?");
      params.push(dto.paymentTermsDays);
    }
    if (dto.planId !== undefined) {
      sets.push("plan_id = ?");
      params.push(dto.planId);
    }
    if (dto.expiryDate !== undefined) {
      sets.push("expiry_date = ?");
      params.push(dto.expiryDate);
    }
    if (sets.length > 0) {
      await connection.execute(`UPDATE subscriptions SET ${sets.join(", ")} WHERE id = ?`, [...params, id]);
    }

    if (dto.lines !== undefined && dto.lines.length > 0) {
      validateMinimumQuantity(plan, dto.lines);
      const lines = await resolveCatalogueLines(dto.lines);
      await connection.execute("DELETE FROM subscription_lines WHERE subscription_id = ?", [id]);
      await insertSubscriptionLines(connection, id, lines);
    } else {
      // The plan may change without new lines: the existing quantities must
      // still satisfy the new plan's minimum.
      validateMinimumQuantity(plan, await loadLinesWith(connection, id));
    }

    await recordEvent(
      connection,
      id,
      actorId,
      "UPDATED",
      subscription.status,
      subscription.status,
      "Draft/quotation fields adjusted.",
    );
  });

  const detail = await getSubscriptionDetail(id);
  if (!detail) {
    throw new AppError(500, "INTERNAL_ERROR", "Subscription update failed unexpectedly.");
  }
  return detail;
}

// ---------------------------------------------------------------------------
// Lifecycle transitions
// ---------------------------------------------------------------------------

export async function submitQuotation(
  id: number,
  actorId: number,
  options: { validityDays?: number; reason?: string } = {},
): Promise<SubscriptionDetail> {
  await withTransaction(async (connection) => {
    const subscription = await lockSubscription(connection, id);
    assertTransition(subscription.status, "QUOTATION");
    let validityDays = options.validityDays;
    if (validityDays === undefined) {
      if (subscription.quotation_template_id === null) {
        validityDays = 15;
      } else {
        const [rows] = await connection.execute(
          "SELECT validity_days FROM quotation_templates WHERE id = ? LIMIT 1",
          [subscription.quotation_template_id],
        );
        const template = (rows as Array<RowDataPacket & { validity_days: number }>)[0];
        validityDays = template?.validity_days ?? 15;
      }
    }
    // Quotation validity is a separate concern from the contract end; the
    // expiry_date column is reserved for the contract term.
    const validUntil = addDaysIso(todayIso(), validityDays);
    await connection.execute(
      "UPDATE subscriptions SET status = 'QUOTATION', quotation_valid_until = ? WHERE id = ?",
      [validUntil, id],
    );
    await recordEvent(
      connection,
      id,
      actorId,
      "SUBMITTED_QUOTATION",
      subscription.status,
      "QUOTATION",
      options.reason ?? `Quotation valid until ${validUntil}.`,
    );
  });
  return (await getSubscriptionDetail(id)) as SubscriptionDetail;
}

export async function confirmQuotation(
  id: number,
  actorId: number,
  options: { reason?: string } = {},
): Promise<SubscriptionDetail> {
  await withTransaction(async (connection) => {
    const subscription = await lockSubscription(connection, id);
    assertTransition(subscription.status, "CONFIRMED");
    const today = todayIso();
    if (subscription.quotation_valid_until !== null && subscription.quotation_valid_until < today) {
      throw new AppError(
        400,
        "QUOTATION_EXPIRED",
        `The quotation expired on ${subscription.quotation_valid_until} and cannot be confirmed.`,
      );
    }
    await connection.execute("UPDATE subscriptions SET status = 'CONFIRMED' WHERE id = ?", [id]);
    await recordEvent(connection, id, actorId, "CONFIRMED", subscription.status, "CONFIRMED", options.reason);
  });
  return (await getSubscriptionDetail(id)) as SubscriptionDetail;
}

export async function activateSubscription(
  id: number,
  actorId: number,
  options: { reason?: string } = {},
): Promise<SubscriptionDetail> {
  await withTransaction(async (connection) => {
    const subscription = await lockSubscription(connection, id);
    assertTransition(subscription.status, "ACTIVE");
    const today = todayIso();
    if (subscription.start_date === null) {
      throw new AppError(400, "START_DATE_REQUIRED", "Set a start date before activation.");
    }
    if (subscription.start_date > today) {
      throw new AppError(
        400,
        "START_DATE_NOT_REACHED",
        `Activation is permitted on or after the start date (${subscription.start_date}).`,
      );
    }
    // The contract end is whatever staff agreed (or open-ended). It is never
    // derived from the billing interval, so an open-ended subscription keeps
    // producing an invoice every cycle.
    if (subscription.expiry_date !== null && subscription.expiry_date <= today) {
      throw new AppError(
        400,
        "CONTRACT_ENDED",
        `The contract ended on ${subscription.expiry_date} and cannot be activated.`,
      );
    }
    await connection.execute(
      "UPDATE subscriptions SET status = 'ACTIVE', next_billing_at = ? WHERE id = ?",
      [mysqlUtc(new Date(`${subscription.start_date}T00:00:00Z`)), id],
    );
    await recordEvent(
      connection,
      id,
      actorId,
      "ACTIVATED",
      subscription.status,
      "ACTIVE",
      options.reason
        ?? `Billing from ${subscription.start_date}; ${
          subscription.expiry_date === null
            ? "open-ended until closed"
            : `contract ends ${subscription.expiry_date}`
        }.`,
    );
  });
  return (await getSubscriptionDetail(id)) as SubscriptionDetail;
}

export async function pauseSubscription(
  id: number,
  actorId: number,
  options: { reason?: string } = {},
): Promise<SubscriptionDetail> {
  await withTransaction(async (connection) => {
    const subscription = await lockSubscription(connection, id);
    assertTransition(subscription.status, "PAUSED");
    const plan = await getPlanById(subscription.plan_id);
    if (!plan) {
      throw new AppError(404, "PLAN_NOT_FOUND", "The subscription's plan no longer exists.");
    }
    if (!plan.allow_pause) {
      throw new AppError(409, "PAUSE_NOT_ALLOWED", `Plan ${plan.name} does not allow pausing.`);
    }
    const pausedAt = new Date();
    await connection.execute(
      "UPDATE subscriptions SET status = 'PAUSED', paused_at = ? WHERE id = ?",
      [mysqlUtc(pausedAt), id],
    );
    await recordEvent(
      connection,
      id,
      actorId,
      "PAUSED",
      subscription.status,
      "PAUSED",
      options.reason ?? `Paused at ${mysqlUtc(pausedAt)}.`,
    );
  });
  return (await getSubscriptionDetail(id)) as SubscriptionDetail;
}

export async function resumeSubscription(
  id: number,
  actorId: number,
  options: { reason?: string } = {},
): Promise<SubscriptionDetail> {
  await withTransaction(async (connection) => {
    const subscription = await lockSubscription(connection, id);
    assertTransition(subscription.status, "ACTIVE");
    // Recommended MVP policy: shift the next billing date by the paused duration.
    const pausedAt = subscription.paused_at !== null ? parseUtc(subscription.paused_at) : null;
    const resumedAt = new Date();
    const shiftedMs = pausedAt === null ? 0 : resumedAt.getTime() - pausedAt.getTime();
    let reason = options.reason;
    if (reason === undefined && pausedAt !== null) {
      reason = `Resumed after ${(shiftedMs / 86400000).toFixed(2)} day(s); billing shifted accordingly.`;
    }
    if (subscription.next_billing_at !== null && pausedAt !== null) {
      const next = new Date(parseUtc(subscription.next_billing_at).getTime() + shiftedMs);
      await connection.execute(
        "UPDATE subscriptions SET status = 'ACTIVE', paused_at = NULL, next_billing_at = ? WHERE id = ?",
        [mysqlUtc(next), id],
      );
    } else {
      await connection.execute(
        "UPDATE subscriptions SET status = 'ACTIVE', paused_at = NULL WHERE id = ?",
        [id],
      );
    }
    await recordEvent(connection, id, actorId, "RESUMED", subscription.status, "ACTIVE", reason);
  });
  return (await getSubscriptionDetail(id)) as SubscriptionDetail;
}

/**
 * Early close honours the plan's allowEarlyClose; Admin may always override
 * and the override is stated in the event record. Paused subscriptions close
 * through the authorized-closure branch.
 */
export async function closeSubscription(
  id: number,
  actorId: number,
  actorRole: "ADMIN" | "STAFF" | "CUSTOMER",
  options: { reason?: string } = {},
): Promise<SubscriptionDetail> {
  await withTransaction(async (connection) => {
    const subscription = await lockSubscription(connection, id);
    if (subscription.status !== "ACTIVE" && subscription.status !== "PAUSED") {
      throw new AppError(
        409,
        "INVALID_TRANSITION",
        `Only ACTIVE or PAUSED subscriptions can be closed (currently ${subscription.status}).`,
      );
    }
    const plan = await getPlanById(subscription.plan_id);
    if (!plan) {
      throw new AppError(404, "PLAN_NOT_FOUND", "The subscription's plan no longer exists.");
    }
    let override = false;
    if (subscription.status === "ACTIVE" && !plan.allow_early_close) {
      if (actorRole !== "ADMIN") {
        throw new AppError(
          409,
          "CLOSE_NOT_ALLOWED",
          `Plan ${plan.name} does not allow early closure; an Admin override is required.`,
        );
      }
      override = true;
    }
    const closedAt = new Date();
    await connection.execute(
      "UPDATE subscriptions SET status = 'CLOSED', closed_at = ? WHERE id = ?",
      [mysqlUtc(closedAt), id],
    );
    await recordEvent(
      connection,
      id,
      actorId,
      override ? "CLOSED_ADMIN_OVERRIDE" : "CLOSED",
      subscription.status,
      "CLOSED",
      options.reason ?? `Closed at ${mysqlUtc(closedAt)}${override ? " by Admin override." : "."}`,
    );
  });
  return (await getSubscriptionDetail(id)) as SubscriptionDetail;
}

/** Renewal: fresh draft linked to the previous contract; history preserved. */
export async function renewSubscription(
  id: number,
  actorId: number,
  options: { reason?: string } = {},
): Promise<SubscriptionDetail> {
  const newId = await withTransaction(async (connection) => {
    const subscription = await lockSubscription(connection, id);
    if (subscription.status !== "ACTIVE" && subscription.status !== "CLOSED") {
      throw new AppError(
        409,
        "INVALID_TRANSITION",
        `Only ACTIVE or CLOSED subscriptions can be renewed (currently ${subscription.status}).`,
      );
    }
    const plan = await getPlanById(subscription.plan_id);
    if (!plan) {
      throw new AppError(404, "PLAN_NOT_FOUND", "The subscription's plan no longer exists.");
    }
    if (!plan.allow_renewal) {
      throw new AppError(409, "RENEWAL_NOT_ALLOWED", `Plan ${plan.name} does not allow renewal.`);
    }
    // Renewal continues the agreed lines verbatim, so a deleted catalogue
    // product or a price change cannot block or rewrite the new contract.
    const previousLines = await loadLinesWith(connection, id);
    validateMinimumQuantity(plan, previousLines);
    const newStart = addDaysIso(subscription.expiry_date ?? todayIso(), 1);
    const idOut = await insertSubscription(connection, {
      customerId: subscription.customer_id,
      planId: subscription.plan_id,
      templateId: subscription.quotation_template_id,
      startDate: newStart,
      expiryDate: null,
      paymentTermsDays: subscription.payment_terms_days,
      createdBy: actorId,
      previousSubscriptionId: subscription.id,
    });
    await insertSnapshotLines(connection, idOut, previousLines);
    await recordEvent(
      connection,
      idOut,
      actorId,
      "CREATED",
      null,
      "DRAFT",
      options.reason ?? `Renewal of ${subscription.subscription_number}.`,
    );
    await recordEvent(
      connection,
      idOut,
      actorId,
      "RENEWED",
      subscription.status,
      "DRAFT",
      options.reason ?? `Continues ${subscription.subscription_number}.`,
    );
    return idOut;
  });
  return (await getSubscriptionDetail(newId)) as SubscriptionDetail;
}

// ---------------------------------------------------------------------------

const ALLOWED: Record<SubscriptionStatus, SubscriptionStatus[]> = {
  DRAFT: ["QUOTATION"],
  QUOTATION: ["CONFIRMED"],
  CONFIRMED: ["ACTIVE"],
  ACTIVE: ["PAUSED", "CLOSED"],
  PAUSED: ["ACTIVE", "CLOSED"],
  CLOSED: [],
};

function assertTransition(from: SubscriptionStatus, to: SubscriptionStatus): void {
  if (!ALLOWED[from].includes(to)) {
    throw new AppError(409, "INVALID_TRANSITION", `A ${from} subscription cannot move to ${to}.`);
  }
}
