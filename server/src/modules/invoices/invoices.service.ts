import { RowDataPacket, type PoolConnection } from "mysql2/promise";
import { AppError } from "../../middleware/errors.js";
import { mysqlUtc, parseUtc, todayIso } from "../../lib/dates.js";
import { fromCents, toCents } from "../../lib/money.js";
import { query, withTransaction } from "../../config/db.js";
import type { PaymentCreateDto } from "./invoices.schemas.js";

/**
 * Invoices and payments (BILLING_AND_FINANCE §8–§9).
 * Derived conditions (PARTIALLY_PAID, OVERDUE) are computed, never persisted;
 * an invoice is never marked PAID while a positive balance remains.
 */

export type InvoiceStatus = "DRAFT" | "CONFIRMED" | "PAID" | "CANCELLED";

export interface InvoiceListRow extends RowDataPacket {
  id: number;
  invoice_number: string;
  subscription_id: number;
  subscription_number: string;
  customer_id: number;
  customer_email: string;
  period_start: string;
  period_end: string;
  issue_date: string;
  due_date: string;
  currency_code: string;
  subtotal: string;
  discount_total: string;
  tax_total: string;
  grand_total: string;
  status: InvoiceStatus;
}

export interface InvoiceLineRow extends RowDataPacket {
  id: number;
  product_id: number | null;
  variant_id: number | null;
  description_snapshot: string;
  quantity: number;
  unit_price: string;
  line_subtotal: string;
  discount_amount: string;
  discount_rule_id: number | null;
  tax_name_snapshot: string | null;
  tax_rate_snapshot: string | null;
  tax_mode_snapshot: "EXCLUSIVE" | "INCLUSIVE" | null;
  tax_amount: string;
  line_total: string;
}

export interface PaymentRow extends RowDataPacket {
  id: number;
  invoice_id: number;
  method: string;
  amount: string;
  paid_at: string;
  note: string | null;
  reference: string | null;
  status: "SUCCESSFUL" | "FAILED" | "REFUNDED";
  recorded_by: number | null;
  created_at: string;
}

export interface InvoiceDto {
  id: number;
  invoiceNumber: string;
  subscriptionId: number;
  subscriptionNumber: string | null;
  customerId: number;
  customerEmail: string | null;
  periodStart: string;
  periodEnd: string;
  issueDate: string;
  dueDate: string;
  currencyCode: string;
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  grandTotal: string;
  status: InvoiceStatus;
  confirmedAt: string | null;
  cancelledAt: string | null;
  lines: Array<{
    id: number;
    productId: number | null;
    variantId: number | null;
    description: string;
    quantity: number;
    unitPrice: string;
    lineSubtotal: string;
    discountAmount: string;
    discountRuleId: number | null;
    taxName: string | null;
    taxRate: string | null;
    taxMode: "EXCLUSIVE" | "INCLUSIVE" | null;
    taxAmount: string;
    lineTotal: string;
  }>;
  payments: Array<{
    id: number;
    method: string;
    amount: string;
    paidAt: string;
    note: string | null;
    reference: string | null;
    status: string;
    recordedByEmail: string | null;
  }>;
  /** Ledger section (§8): success payments cover; failures/refunds excluded. */
  ledger: {
    paidTotal: string;
    outstanding: string;
    partiallyPaid: boolean;
    overdue: boolean;
  };
}

function listRowDto(row: InvoiceListRow) {
  return {
    id: row.id,
    invoiceNumber: row.invoice_number,
    subscriptionId: row.subscription_id,
    subscriptionNumber: row.subscription_number,
    customerId: row.customer_id,
    customerEmail: row.customer_email,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    issueDate: row.issue_date,
    dueDate: row.due_date,
    currencyCode: row.currency_code,
    subtotal: row.subtotal,
    discountTotal: row.discount_total,
    taxTotal: row.tax_total,
    grandTotal: row.grand_total,
    status: row.status,
  };
}

const listSelect = `
  SELECT i.id, i.invoice_number, i.subscription_id, s.subscription_number,
         i.customer_id, u.email AS customer_email,
         i.period_start, i.period_end, i.issue_date, i.due_date, i.currency_code,
         i.subtotal, i.discount_total, i.tax_total, i.grand_total, i.status,
         i.confirmed_at, i.cancelled_at
  FROM invoices i
  JOIN subscriptions s ON s.id = i.subscription_id
  JOIN users u ON u.id = i.customer_id`;

export async function listInvoices(options: {
  limit: number;
  offset: number;
  status?: InvoiceStatus;
  customerId?: number;
  subscriptionId?: number;
  overdueOnly?: boolean;
  issuedFrom?: string;
  issuedTo?: string;
}): Promise<{ rows: Array<ReturnType<typeof listRowDto>>; total: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (options.status !== undefined) {
    conditions.push("i.status = ?");
    params.push(options.status);
  }
  if (options.customerId !== undefined) {
    conditions.push("i.customer_id = ?");
    params.push(options.customerId);
  }
  if (options.subscriptionId !== undefined) {
    conditions.push("i.subscription_id = ?");
    params.push(options.subscriptionId);
  }
  if (options.issuedFrom !== undefined) {
    conditions.push("i.issue_date >= ?");
    params.push(options.issuedFrom);
  }
  if (options.issuedTo !== undefined) {
    conditions.push("i.issue_date <= ?");
    params.push(options.issuedTo);
  }
  if (options.overdueOnly === true) {
    // Derived overdue (§8): past due + open balance, CANCELLED excluded.
    conditions.push(
      `i.status = 'CONFIRMED' AND i.due_date < ? AND (SELECT COALESCE(SUM(p.amount), 0)
       FROM payments p WHERE p.invoice_id = i.id AND p.status = 'SUCCESSFUL') < i.grand_total`,
    );
    params.push(todayIso());
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = await query<InvoiceListRow[]>(
    `${listSelect} ${where} ORDER BY i.id DESC LIMIT ? OFFSET ?`,
    [...params, options.limit, options.offset],
  );
  const countRows = await query<Array<RowDataPacket & { total: number }>>(
    `SELECT COUNT(*) AS total FROM invoices i ${where}`,
    params,
  );
  return { rows: rows.map(listRowDto), total: Number(countRows[0]?.total ?? 0) };
}

async function loadLines(invoiceId: number): Promise<InvoiceLineRow[]> {
  return query<InvoiceLineRow[]>(
    `SELECT * FROM invoice_lines WHERE invoice_id = ? ORDER BY id`,
    [invoiceId],
  );
}

/** Successful payments only (FAILED/REFUNDED excluded from coverage). */
export async function paidTotalCents(connection: PoolConnection | null, invoiceId: number): Promise<bigint> {
  const sql =
    `SELECT COALESCE(SUM(amount), 0) AS paid FROM payments
     WHERE invoice_id = ? AND status = 'SUCCESSFUL'`;
  const rows =
    connection === null
      ? await query<Array<RowDataPacket & { paid: string }>>(sql, [invoiceId])
      : ((await connection.query(sql, [invoiceId]))[0] as Array<RowDataPacket & { paid: string }>);
  return toCents(rows[0]?.paid ?? "0.00");
}

export async function getInvoiceDetail(invoiceId: number): Promise<InvoiceDto | null> {
  const rows = await query<
    Array<InvoiceListRow & Record<"confirmed_at" | "cancelled_at", string | null>>
  >(`${listSelect} WHERE i.id = ? LIMIT 1`, [invoiceId]);
  const header = rows[0];
  if (!header) {
    return null;
  }
  const lines = (await loadLines(invoiceId)).map((line) => ({
    id: line.id,
    productId: line.product_id,
    variantId: line.variant_id,
    description: line.description_snapshot,
    quantity: line.quantity,
    unitPrice: line.unit_price,
    lineSubtotal: line.line_subtotal,
    discountAmount: line.discount_amount,
    discountRuleId: line.discount_rule_id,
    taxName: line.tax_name_snapshot,
    taxRate: line.tax_rate_snapshot,
    taxMode: line.tax_mode_snapshot,
    taxAmount: line.tax_amount,
    lineTotal: line.line_total,
  }));
  const payments = (
    await query<Array<PaymentRow & { recorded_by_email: string | null }>>(
      `SELECT p.*, ru.email AS recorded_by_email
       FROM payments p LEFT JOIN users ru ON ru.id = p.recorded_by
       WHERE p.invoice_id = ? ORDER BY p.id`,
      [invoiceId],
    )
  ).map((payment) => ({
    id: payment.id,
    method: payment.method,
    amount: payment.amount,
    paidAt: payment.paid_at,
    note: payment.note,
    reference: payment.reference,
    status: payment.status,
    recordedByEmail: payment.recorded_by_email,
  }));

  const paidCents = await paidTotalCents(null, invoiceId);
  const grandCents = toCents(header.grand_total);
  const outstandingCents = grandCents > paidCents ? grandCents - paidCents : 0n;
  const cancelled = header.status === "CANCELLED";
  const overdue = !cancelled && header.status !== "DRAFT" && header.due_date < todayIso() && outstandingCents > 0n;

  return {
    id: header.id,
    invoiceNumber: header.invoice_number,
    subscriptionId: header.subscription_id,
    subscriptionNumber: header.subscription_number,
    customerId: header.customer_id,
    customerEmail: header.customer_email,
    periodStart: header.period_start,
    periodEnd: header.period_end,
    issueDate: header.issue_date,
    dueDate: header.due_date,
    currencyCode: header.currency_code,
    subtotal: header.subtotal,
    discountTotal: header.discount_total,
    taxTotal: header.tax_total,
    grandTotal: header.grand_total,
    status: header.status,
    confirmedAt: header.confirmed_at,
    cancelledAt: header.cancelled_at,
    lines,
    payments,
    ledger: {
      paidTotal: fromCents(paidCents),
      outstanding: fromCents(outstandingCents),
      partiallyPaid: paidCents > 0n && outstandingCents > 0n,
      overdue,
    },
  };
}

export async function confirmInvoice(id: number, actorId: number): Promise<InvoiceDto> {
  await withTransaction(async (connection) => {
    const [rows] = await connection.execute("SELECT id, status FROM invoices WHERE id = ? LIMIT 1 FOR UPDATE", [id]);
    const invoice = (rows as unknown as Array<RowDataPacket & { id: number; status: InvoiceStatus }>)[0];
    if (!invoice) {
      throw new AppError(404, "INVOICE_NOT_FOUND", `Invoice ${id} does not exist.`);
    }
    if (invoice.status !== "DRAFT") {
      throw new AppError(409, "INVALID_TRANSITION", `Only DRAFT invoices can be confirmed (currently ${invoice.status}).`);
    }
    await connection.execute("UPDATE invoices SET status = 'CONFIRMED', confirmed_at = ? WHERE id = ?", [
      mysqlUtc(new Date()),
      id,
    ]);
    await connection.execute(
      `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id)
       VALUES (?, 'invoice_confirmed', 'invoices', ?)`,
      [actorId, id],
    );
  });
  const detail = await getInvoiceDetail(id);
  if (detail === null) {
    throw new AppError(404, "INVOICE_NOT_FOUND", `Invoice ${id} does not exist.`);
  }
  return detail;
}

export async function cancelInvoice(id: number, actorId: number, reason?: string): Promise<InvoiceDto> {
  await withTransaction(async (connection) => {
    const [rows] = await connection.execute("SELECT id, status FROM invoices WHERE id = ? LIMIT 1 FOR UPDATE", [id]);
    const invoice = (rows as unknown as Array<RowDataPacket & { id: number; status: InvoiceStatus }>)[0];
    if (!invoice) {
      throw new AppError(404, "INVOICE_NOT_FOUND", `Invoice ${id} does not exist.`);
    }
    if (invoice.status === "PAID") {
      throw new AppError(409, "CANCEL_NOT_ALLOWED", "PAID invoices cannot be cancelled; record a refund first.");
    }
    if (invoice.status === "CANCELLED") {
      return; // idempotent no-op
    }
    // Project policy: invoices with successful payments cannot be cancelled;
    // refunds/credits are out of MVP scope (documented deviation).
    const paid = await paidTotalCents(connection, id);
    if (paid > 0n) {
      throw new AppError(409, "CANCEL_HAS_PAYMENTS", "Record/refund the payment before cancelling this invoice.");
    }
    await connection.execute("UPDATE invoices SET status = 'CANCELLED', cancelled_at = ? WHERE id = ?", [
      mysqlUtc(new Date()),
      id,
    ]);
    await connection.execute(
      `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata_json)
       VALUES (?, 'invoice_cancelled', 'invoices', ?, JSON_OBJECT('reason', ?))`,
      [actorId, id, reason ?? null],
    );
  });
  const detail = await getInvoiceDetail(id);
  if (detail === null) {
    throw new AppError(404, "INVOICE_NOT_FOUND", `Invoice ${id} does not exist.`);
  }
  return detail;
}

/**
 * Records a payment atomically (§9): lock invoice, verify it is billable,
 * compute outstanding from successful payments, reject overpayment, insert,
 * flip to PAID when fully covered.
 */
export async function recordPayment(
  invoiceId: number,
  dto: PaymentCreateDto,
  actorId: number,
): Promise<InvoiceDto> {
  const paidAt = dto.paidAt ? mysqlUtc(parseUtc(dto.paidAt.replace(" ", "T"))) : mysqlUtc(new Date());
  await withTransaction(async (connection) => {
    const [rows] = await connection.execute(
      "SELECT id, status, grand_total FROM invoices WHERE id = ? LIMIT 1 FOR UPDATE",
      [invoiceId],
    );
    const invoice = (rows as unknown as Array<RowDataPacket & { id: number; status: InvoiceStatus; grand_total: string }>)[0];
    if (!invoice) {
      throw new AppError(404, "INVOICE_NOT_FOUND", `Invoice ${invoiceId} does not exist.`);
    }
    if (invoice.status === "DRAFT") {
      throw new AppError(409, "INVOICE_NOT_CONFIRMED", "Confirm the invoice before recording payments.");
    }
    if (invoice.status === "CANCELLED") {
      throw new AppError(409, "INVOICE_CANCELLED", "Cancelled invoices cannot accept payments.");
    }
    const paidCents = await paidTotalCents(connection, invoiceId);
    const grandCents = toCents(invoice.grand_total);
    const outstandingCents = grandCents > paidCents ? grandCents - paidCents : 0n;
    if (outstandingCents === 0n) {
      throw new AppError(409, "INVOICE_ALREADY_PAID", "This invoice is already fully paid.");
    }
    const amountCents = toCents(dto.amount);
    // Default overpayment policy: reject (no silent customer credit).
    if (amountCents <= 0n) {
      throw new AppError(400, "INVALID_AMOUNT", "Payment amounts must be positive.");
    }
    if (amountCents > outstandingCents) {
      throw new AppError(409, "OVERPAYMENT_NOT_ALLOWED", `Outstanding balance is ${fromCents(outstandingCents)}; overpayments are rejected.`);
    }
    await connection.execute(
      `INSERT INTO payments (invoice_id, method, amount, paid_at, note, reference, status, recorded_by)
       VALUES (?, ?, ?, ?, ?, ?, 'SUCCESSFUL', ?)`,
      [invoiceId, dto.method, dto.amount, paidAt, dto.note ?? null, dto.reference ?? null, actorId],
    );
    if (amountCents === outstandingCents) {
      await connection.execute("UPDATE invoices SET status = 'PAID' WHERE id = ?", [invoiceId]);
    }
  });
  const detail = await getInvoiceDetail(invoiceId);
  if (detail === null) {
    throw new AppError(404, "INVOICE_NOT_FOUND", `Invoice ${invoiceId} does not exist.`);
  }
  return detail;
}

export async function listPayments(options: {
  limit: number;
  offset: number;
  customerId?: number;
  invoiceId?: number;
  method?: string;
  paidFrom?: string;
  paidTo?: string;
}): Promise<{
  rows: Array<{
    id: number;
    invoiceId: number;
    invoiceNumber: string;
    customerId: number;
    customerEmail: string;
    method: string;
    amount: string;
    paidAt: string;
    note: string | null;
    reference: string | null;
    status: string;
  }>;
  total: number;
}> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (options.customerId !== undefined) {
    conditions.push("i.customer_id = ?");
    params.push(options.customerId);
  }
  if (options.invoiceId !== undefined) {
    conditions.push("p.invoice_id = ?");
    params.push(options.invoiceId);
  }
  if (options.method !== undefined) {
    conditions.push("p.method = ?");
    params.push(options.method);
  }
  if (options.paidFrom !== undefined) {
    conditions.push("p.paid_at >= ?");
    params.push(`${options.paidFrom} 00:00:00`);
  }
  if (options.paidTo !== undefined) {
    conditions.push("p.paid_at <= ?");
    params.push(`${options.paidTo} 23:59:59`);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = await query<
    Array<RowDataPacket & { id: number; invoice_id: number; invoice_number: string; customer_id: number; customer_email: string; method: string; amount: string; paid_at: string; note: string | null; reference: string | null; status: string }>
  >(
    `SELECT p.id, p.invoice_id, i.invoice_number, i.customer_id, u.email AS customer_email,
            p.method, p.amount, p.paid_at, p.note, p.reference, p.status
     FROM payments p
     JOIN invoices i ON i.id = p.invoice_id
     JOIN users u ON u.id = i.customer_id
     ${where} ORDER BY p.paid_at DESC, p.id DESC LIMIT ? OFFSET ?`,
    [...params, options.limit, options.offset],
  );
  const countRows = await query<Array<RowDataPacket & { total: number }>>(
    `SELECT COUNT(*) AS total FROM payments p JOIN invoices i ON i.id = p.invoice_id ${where}`,
    params,
  );
  return {
    rows: rows.map((row) => ({
      id: row.id,
      invoiceId: row.invoice_id,
      invoiceNumber: row.invoice_number,
      customerId: row.customer_id,
      customerEmail: row.customer_email,
      method: row.method,
      amount: row.amount,
      paidAt: row.paid_at,
      note: row.note,
      reference: row.reference,
      status: row.status,
    })),
    total: Number(countRows[0]?.total ?? 0),
  };
}
