import { RowDataPacket, type PoolConnection, type ResultSetHeader } from "mysql2/promise";
import { randomUUID } from "node:crypto";
import { addDaysIso, addIntervalIso, mysqlUtc, parseUtc, todayIso } from "../../lib/dates.js";
import { fromCents, toCents } from "../../lib/money.js";
import { query, withTransaction } from "../../config/db.js";
import { consumeDiscountUse, type DiscountRuleRow } from "../discounts/discounts.service.js";

/**
 * The recurring billing engine (BILLING_AND_FINANCE §6–§7).
 *
 * Guarantees:
 * - One invoice per (subscription, periodStart, periodEnd) — enforced by the
 *   database unique key `uq_invoice_period`; a duplicate insert rolls back and
 *   is reported as ALREADY_BILLED instead of failing the whole run.
 * - `next_billing_at` only advances after invoice + lines + redemptions commit.
 * - All arithmetic is BigInt cents; the persisted strings are exact
 *   DECIMAL(12,2) values and never pass through JS floats.
 * - Discounts never stack: the single highest-value eligible rule wins
 *   (project redemption policy, §5); at most one redemption per rule per
 *   subscription; usage is atomic via a conditional UPDATE.
 */

type IntervalUnit = "DAY" | "WEEK" | "MONTH" | "YEAR";

interface DueCandidateRow extends RowDataPacket {
  id: number;
  subscription_number: string;
  next_billing_at: string;
  expiry_date: string | null;
  billing_interval_unit: IntervalUnit;
  billing_interval_count: number;
}

interface SubscriptionLockedRow
  extends RowDataPacket {
  id: number;
  subscription_number: string;
  customer_id: number;
  plan_id: number;
  start_date: string | null;
  expiry_date: string | null;
  next_billing_at: string | null;
  payment_terms_days: number;
  status: "DRAFT" | "QUOTATION" | "CONFIRMED" | "ACTIVE" | "PAUSED" | "CLOSED";
  billing_interval_unit: IntervalUnit;
  billing_interval_count: number;
}

interface SubscriptionLineRow extends RowDataPacket {
  id: number;
  product_id: number | null;
  variant_id: number | null;
  description_snapshot: string;
  quantity: number;
  unit_price: string;
  tax_name_snapshot: string | null;
  tax_rate_snapshot: string | null;
  tax_mode_snapshot: "EXCLUSIVE" | "INCLUSIVE" | null;
}

export interface InvoiceResult {
  invoiceId: number;
  invoiceNumber: string;
  subscriptionId: number;
  subscriptionNumber: string;
  periodStart: string;
  periodEnd: string;
  grandTotal: string;
  discountApplied: string;
}

export interface SkippedResult {
  subscriptionId: number;
  subscriptionNumber: string;
  reason: "ALREADY_BILLED" | "NOT_DUE" | "NOT_ACTIVE" | "BILLING_COMPLETE" | "NO_LINES";
}

export interface BillingRunResult {
  scanned: number;
  invoices: InvoiceResult[];
  skipped: SkippedResult[];
  autoClosed: Array<{ subscriptionId: number; subscriptionNumber: string }>;
  failed: Array<{ subscriptionId: number; subscriptionNumber: string; operation: "BILL" | "AUTO_CLOSE" }>;
}

/** One cent-level percentage with half-up rounding (mirror of money.ts). */
function percentCents(cents: bigint, rate: string): bigint {
  const numerator = cents * toCents(rate);
  const quotient = numerator / 10000n;
  const remainder = numerator % 10000n;
  if (remainder === 0n) {
    return quotient;
  }
  const bump = (remainder < 0n ? -remainder : remainder) >= 5000n
    ? (numerator < 0n ? -1n : 1n)
    : 0n;
  return quotient + bump;
}

/** Tax component embedded in an inclusive amount: amount × r / (100 + r). */
function inclusiveCents(cents: bigint, rate: string): bigint {
  return (cents * toCents(rate)) / (10000n + toCents(rate));
}

/**
 * Distributes `total` cents across shares by largest remainder (Hamilton
 * method): every share gets its floored proportion, then leftover cents go to
 * the largest fractional parts in index order. Unlike "remainder to last", no
 * line can absorb the whole discount simply because it is the last one when
 * each proportional share floors to zero.
 */
function allocateCents(total: bigint, shares: bigint[]): bigint[] {
  const totalShare = shares.reduce((sum, share) => sum + share, 0n);
  if (totalShare === 0n) {
    return shares.map(() => 0n);
  }
  const allocated = shares.map((share) => (total * share) / totalShare);
  const remainders = shares.map((share, index) => ({
    index,
    remainder: (total * share) % totalShare,
  }));
  remainders.sort((a, b) => {
    if (a.remainder === b.remainder) {
      return a.index - b.index;
    }
    return a.remainder > b.remainder ? -1 : 1;
  });
  let leftover = total - allocated.reduce((sum, value) => sum + value, 0n);
  for (let slot = 0; leftover > 0n; slot += 1) {
    const target = valueAt(remainders, slot % remainders.length, "discount remainder");
    allocated[target.index] = valueAt(allocated, target.index, "discount allocation") + 1n;
    leftover -= 1n;
  }
  return allocated;
}

function invoiceNumber(id: number): string {
  return `INV-${String(id).padStart(6, "0")}`;
}

interface RuleCandidate {
  rule: DiscountRuleRow;
  amountCents: bigint;
  scopedLineIndexes: number[];
}

function valueAt<T>(values: readonly T[], index: number, label: string): T {
  const value = values[index];
  if (value === undefined) {
    throw new Error(`Missing ${label} at index ${index}.`);
  }
  return value;
}

/**
 * Evaluates every active rule exactly once and picks the single best
 * (highest value, lowest id on ties). Rules already redeemed for this
 * subscription are skipped — one redemption per rule per subscription is the
 * documented project policy.
 */
async function selectDiscount(
  connection: PoolConnection,
  subscriptionId: number,
  lines: SubscriptionLineRow[],
): Promise<RuleCandidate | null> {
  const [candidateRows] = await connection.execute(
    "SELECT * FROM discount_rules WHERE is_active = 1 ORDER BY id",
  );
  const candidates = candidateRows as DiscountRuleRow[];
  if (candidates.length === 0) {
    return null;
  }

  // One redemption per rule per subscription: load them all in one query
  // instead of probing per candidate rule.
  const [redemptionRows] = await connection.execute(
    "SELECT DISTINCT discount_rule_id FROM discount_redemptions WHERE subscription_id = ?",
    [subscriptionId],
  );
  const redeemedRuleIds = new Set(
    (redemptionRows as Array<RowDataPacket & { discount_rule_id: number }>).map((row) =>
      Number(row.discount_rule_id),
    ),
  );

  // Product scope map in a single query.
  const scopedRules = candidates.filter((rule) => rule.scope === "PRODUCTS");
  const productMap = new Map<number, Set<number>>();
  if (scopedRules.length > 0) {
    const placeholders = scopedRules.map(() => "?").join(",");
    const [productRows] = await connection.execute(
      `SELECT discount_rule_id, product_id FROM discount_products
       WHERE discount_rule_id IN (${placeholders})`,
      scopedRules.map((rule) => rule.id),
    );
    const rows = productRows as Array<RowDataPacket & { discount_rule_id: number; product_id: number }>;
    for (const row of rows) {
      const set = productMap.get(Number(row.discount_rule_id)) ?? new Set<number>();
      set.add(Number(row.product_id));
      productMap.set(Number(row.discount_rule_id), set);
    }
  }

  const now = new Date();
  let best: RuleCandidate | null = null;
  for (const rule of candidates) {
    // Full datetime comparison: a rule ending at 18:00 must stop applying that
    // evening, not only on the next calendar day.
    if (rule.starts_at !== null && now < parseUtc(rule.starts_at)) {
      continue;
    }
    if (rule.ends_at !== null && now > parseUtc(rule.ends_at)) {
      continue;
    }
    if (rule.usage_limit !== null && rule.usage_count >= rule.usage_limit) {
      continue;
    }
    // Project redemption policy: one redemption per rule per subscription.
    if (redeemedRuleIds.has(rule.id)) {
      continue;
    }

    const scopedLineIndexes: number[] = [];
    for (let index = 0; index < lines.length; index += 1) {
      const line = valueAt(lines, index, "subscription line");
      if (rule.scope === "PRODUCTS") {
        const productIds = productMap.get(rule.id);
        const productId = line.product_id;
        if (productId !== null && productIds !== undefined && productIds.has(productId)) {
          scopedLineIndexes.push(index);
        }
      } else {
        scopedLineIndexes.push(index);
      }
    }
    if (scopedLineIndexes.length === 0) {
      continue;
    }

    const baseCents = scopedLineIndexes.reduce(
      (sum, index) => {
        const line = valueAt(lines, index, "scoped subscription line");
        return sum + toCents(line.unit_price) * BigInt(line.quantity);
      },
      0n,
    );
    if (rule.minimum_purchase !== null && baseCents < toCents(rule.minimum_purchase)) {
      continue;
    }
    if (rule.minimum_quantity !== null) {
      const quantity = scopedLineIndexes.reduce(
        (sum, index) => sum + valueAt(lines, index, "scoped subscription line").quantity,
        0,
      );
      if (quantity < rule.minimum_quantity) {
        continue;
      }
    }

    // Amount: FIXED caps at the eligible base; PERCENTAGE derives from it.
    let amountCents =
      rule.discount_type === "FIXED" ? toCents(rule.value) : percentCents(baseCents, rule.value);
    if (amountCents > baseCents) {
      amountCents = baseCents;
    }
    if (amountCents <= 0n) {
      continue;
    }

    if (best === null || amountCents > best.amountCents) {
      best = { rule, amountCents, scopedLineIndexes };
    }
  }

  return best;
}

/** One invoice inside its own transaction; per-subscription isolation. */
async function billOne(
  subscriptionId: number,
  actorId: number | null,
  nowStamp: string,
): Promise<InvoiceResult | SkippedResult> {
  const subscriptionNumber = await fetchSubscriptionNumber(subscriptionId);
  try {
    const created = await withTransaction(async (connection) => {
      const [lockedRows] = await connection.execute(
        `SELECT s.*, p.billing_interval_unit, p.billing_interval_count
         FROM subscriptions s JOIN plans p ON p.id = s.plan_id
         WHERE s.id = ? LIMIT 1 FOR UPDATE`,
        [subscriptionId],
      );
      const subscription = (lockedRows as Array<RowDataPacket & SubscriptionLockedRow>)[0];
      if (!subscription) {
        throw new Error(`Subscription ${subscriptionId} disappeared during billing.`);
      }
      if (subscription.status !== "ACTIVE") {
        return { reason: "NOT_ACTIVE" as const };
      }
      if (subscription.next_billing_at === null) {
        return { reason: "NOT_DUE" as const };
      }
      if (mysqlUtc(parseStamp(subscription.next_billing_at)) > nowStamp) {
        return { reason: "NOT_DUE" as const };
      }
      const nextIso = subscription.next_billing_at.slice(0, 10);
      const expiry = subscription.expiry_date;
      if (expiry !== null && nextIso >= expiry) {
        return { reason: "BILLING_COMPLETE" as const };
      }

      const newNextIso = addIntervalIso(
        nextIso,
        subscription.billing_interval_unit,
        subscription.billing_interval_count,
      );
      // A contract end inside the interval truncates the final period.
      const periodEnd =
        expiry !== null && expiry < newNextIso ? expiry : newNextIso;

      // Deterministic retry guard: a period that already has an invoice is
      // reported as ALREADY_BILLED instead of relying on driver error text.
      // The uq_invoice_period unique key stays as the final defence.
      const [existingRows] = await connection.execute(
        "SELECT id FROM invoices WHERE subscription_id = ? AND period_start = ? AND period_end = ? LIMIT 1",
        [subscriptionId, nextIso, periodEnd],
      );
      if ((existingRows as RowDataPacket[]).length > 0) {
        return { reason: "ALREADY_BILLED" as const };
      }

      const lines = await loadSubscriptionLines(connection, subscriptionId);
      if (lines.length === 0) {
        return { reason: "NO_LINES" as const };
      }

      // Discounts: pick at most one, consume its use atomically before writes.
      const best = await selectDiscount(connection, subscriptionId, lines);
      let discountRuleId: number | null = null;
      let discountCents = 0n;
      let allocations = lines.map(() => 0n);
      if (best !== null) {
        const consumed = await consumeDiscountUse(connection, best.rule.id);
        if (consumed) {
          discountRuleId = best.rule.id;
          discountCents = best.amountCents;
          const shares = best.scopedLineIndexes.map((index) => {
            const line = valueAt(lines, index, "discounted subscription line");
            return toCents(line.unit_price) * BigInt(line.quantity);
          });
          const scopedAllocations = allocateCents(discountCents, shares);
          for (let slot = 0; slot < best.scopedLineIndexes.length; slot += 1) {
            const lineIndex = valueAt(best.scopedLineIndexes, slot, "discounted line index");
            allocations[lineIndex] = valueAt(scopedAllocations, slot, "discount allocation");
          }
        }
      }

      // Line math in cents (BILLING_AND_FINANCE §3 sequence).
      let subtotalCents = 0n;
      let discountTotalCents = 0n;
      let taxTotalCents = 0n;
      let grandTotalCents = 0n;
      const lineTotals = lines.map((line, index) => {
        const lineSubtotal = toCents(line.unit_price) * BigInt(line.quantity);
        const discount = valueAt(allocations, index, "line discount");
        const taxable = lineSubtotal - discount;
        const rate = line.tax_rate_snapshot;
        let tax = 0n;
        let lineTotal = taxable;
        if (rate !== null && line.tax_mode_snapshot !== null) {
          if (line.tax_mode_snapshot === "EXCLUSIVE") {
            tax = percentCents(taxable, rate);
            lineTotal = taxable + tax;
          } else {
            // Inclusive: extract the component; the amount stays the total.
            tax = inclusiveCents(taxable, rate);
            lineTotal = taxable;
          }
        }
        subtotalCents += lineSubtotal;
        discountTotalCents += discount;
        taxTotalCents += tax;
        grandTotalCents += lineTotal;
        return { lineSubtotal, discount, tax, lineTotal };
      });

      // Invoice numbering follows the subscription pattern: LPAD id, inside txn.
      const issueDate = todayIso();
      const dueDate = addDaysIso(issueDate, subscription.payment_terms_days);
      const [headerResult] = await connection.execute(
        `INSERT INTO invoices
         (invoice_number, subscription_id, customer_id, period_start, period_end,
          issue_date, due_date, currency_code, subtotal, discount_total, tax_total,
          grand_total, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'INR', ?, ?, ?, ?, 'DRAFT')`,
        [
          `T${randomUUID().replaceAll("-", "").slice(0, 31)}`,
          subscriptionId,
          subscription.customer_id,
          nextIso,
          periodEnd,
          issueDate,
          dueDate,
          fromCents(subtotalCents),
          fromCents(discountTotalCents),
          fromCents(taxTotalCents),
          fromCents(grandTotalCents),
        ],
      );
      const invoiceId = Number((headerResult as ResultSetHeader).insertId);
      await connection.execute("UPDATE invoices SET invoice_number = ? WHERE id = ?", [
        invoiceNumber(invoiceId),
        invoiceId,
      ]);

      for (let index = 0; index < lines.length; index += 1) {
        const line = valueAt(lines, index, "subscription line");
        const totals = valueAt(lineTotals, index, "invoice line totals");
        await connection.execute(
          `INSERT INTO invoice_lines
           (invoice_id, product_id, variant_id, description_snapshot, quantity, unit_price,
            line_subtotal, discount_amount, discount_rule_id, tax_name_snapshot,
            tax_rate_snapshot, tax_mode_snapshot, tax_amount, line_total)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            invoiceId,
            line.product_id,
            line.variant_id,
            line.description_snapshot,
            line.quantity,
            line.unit_price,
            fromCents(totals.lineSubtotal),
            fromCents(totals.discount),
            totals.discount > 0n ? discountRuleId : null,
            line.tax_name_snapshot,
            line.tax_rate_snapshot,
            line.tax_mode_snapshot,
            fromCents(totals.tax),
            fromCents(totals.lineTotal),
          ],
        );
      }

      if (discountRuleId !== null) {
        await connection.execute(
          `INSERT INTO discount_redemptions
           (discount_rule_id, subscription_id, invoice_id, customer_id)
           VALUES (?, ?, ?, ?)`,
          [discountRuleId, subscriptionId, invoiceId, subscription.customer_id],
        );
      }

      // Advance the billing date only after invoice + lines + redemption
      // succeeded, and always in the same transaction, per §7.
      await connection.execute(
        "UPDATE subscriptions SET next_billing_at = ? WHERE id = ?",
        [mysqlUtc(new Date(`${newNextIso}T00:00:00Z`)), subscriptionId],
      );

      await connection.execute(
        `INSERT INTO subscription_events (subscription_id, actor_user_id, event_type, from_status, to_status, reason)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          subscriptionId,
          actorId,
          "INVOICED",
          "ACTIVE",
          "ACTIVE",
          `Invoice for ${nextIso} → ${periodEnd} (next billing ${newNextIso}).`,
        ],
      );

      return {
        invoiceId,
        invoiceNumber: invoiceNumber(invoiceId),
        subscriptionId,
        subscriptionNumber: subscription.subscription_number,
        periodStart: nextIso,
        periodEnd,
        grandTotal: fromCents(grandTotalCents),
        discountApplied: fromCents(discountTotalCents),
      };
    });

    if ("reason" in created && created.reason !== undefined) {
      return { subscriptionId, subscriptionNumber, reason: created.reason };
    }
    return created;
  } catch (error) {
    // Only a concurrent run that slipped between the pre-check and the INSERT
    // can still hit the period key; any other failure propagates.
    if (typeof error === "object" && error !== null
      && (error as { code?: string }).code === "ER_DUP_ENTRY") {
      return { subscriptionId, subscriptionNumber, reason: "ALREADY_BILLED" };
    }
    throw error;
  }
}

async function fetchSubscriptionNumber(subscriptionId: number): Promise<string> {
  const rows = await query<Array<RowDataPacket & { subscription_number: string }>>(
    "SELECT subscription_number FROM subscriptions WHERE id = ? LIMIT 1",
    [subscriptionId],
  );
  return rows[0]?.subscription_number ?? `#${subscriptionId}`;
}

async function loadSubscriptionLines(connection: PoolConnection, subscriptionId: number): Promise<SubscriptionLineRow[]> {
  const [lines] = await connection.execute(
    `SELECT id, product_id, variant_id, description_snapshot, quantity, unit_price,
            tax_name_snapshot, tax_rate_snapshot, tax_mode_snapshot
     FROM subscription_lines WHERE subscription_id = ? ORDER BY id`,
    [subscriptionId],
  );
  return lines as Array<RowDataPacket & SubscriptionLineRow>;
}

/** "YYYY-MM-DD HH:MM:SS" (UTC) or ISO — reuse of the dates helper semantics. */
function parseStamp(value: string): Date {
  return new Date(value.includes(" ") ? `${value.replace(" ", "T")}Z` : `${value}Z`);
}

/** One auto-close inside its own transaction (Phase 5 wiring of plan expiry). */
async function autoCloseOne(
  subscriptionId: number,
  actorId: number | null,
): Promise<{ subscriptionId: number; subscriptionNumber: string; closed: boolean }> {
  await withTransaction(async (connection) => {
    const [lockedRows] = await connection.execute(
      "SELECT id, subscription_number, status, expiry_date, next_billing_at FROM subscriptions WHERE id = ? LIMIT 1 FOR UPDATE",
      [subscriptionId],
    );
    const subscription = (lockedRows as Array<RowDataPacket & {
      id: number;
      subscription_number: string;
      status: string;
      expiry_date: string | null;
      next_billing_at: string | null;
    }>)[0];
    if (!subscription || subscription.status !== "ACTIVE") {
      return;
    }
    if (subscription.expiry_date === null || subscription.expiry_date > todayIso()) {
      return;
    }
    // Keep the contract active for a retry when its final billable period has
    // not produced an invoice yet.
    if (subscription.next_billing_at !== null && subscription.next_billing_at.slice(0, 10) < subscription.expiry_date) {
      return;
    }
    const closedAt = new Date();
    await connection.execute("UPDATE subscriptions SET status = 'CLOSED', closed_at = ? WHERE id = ?", [
      mysqlUtc(closedAt),
      subscriptionId,
    ]);
    await connection.execute(
      `INSERT INTO subscription_events (subscription_id, actor_user_id, event_type, from_status, to_status, reason)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        subscriptionId,
        actorId,
        "CLOSED",
        "ACTIVE",
        "CLOSED",
        `Auto-closed after contract end ${subscription.expiry_date} (plan auto-close policy).`,
      ],
    );
  });
  const rows = await query<Array<RowDataPacket & { subscription_number: string; status: string }>>(
    "SELECT subscription_number, status FROM subscriptions WHERE id = ? LIMIT 1",
    [subscriptionId],
  );
  return {
    subscriptionId,
    subscriptionNumber: rows[0]?.subscription_number ?? `#${subscriptionId}`,
    closed: rows[0]?.status === "CLOSED",
  };
}

/**
 * Main entry point: bill every due ACTIVE subscription and auto-close
 * contracts whose plan says so. Each subscription is isolated in its own
 * transaction so one bad row cannot veto the run.
 */
export async function runBilling(actorId: number | null): Promise<BillingRunResult> {
  const nowStamp = mysqlUtc(new Date());
  const result: BillingRunResult = { scanned: 0, invoices: [], skipped: [], autoClosed: [], failed: [] };
  let afterId = 0;

  // Keyset pagination reaches later subscriptions even when an earlier one is
  // skipped or fails and remains due for the next run.
  for (;;) {
    const candidates = await query<DueCandidateRow[]>(
      `SELECT s.id, s.subscription_number, s.next_billing_at, s.expiry_date,
            p.billing_interval_unit, p.billing_interval_count
     FROM subscriptions s JOIN plans p ON p.id = s.plan_id
     WHERE s.status = 'ACTIVE' AND s.next_billing_at IS NOT NULL AND s.next_billing_at <= ?
       AND s.id > ?
     ORDER BY s.id
     LIMIT 500`,
      [nowStamp, afterId],
    );
    if (candidates.length === 0) break;
    for (const candidate of candidates) {
      afterId = candidate.id;
      result.scanned += 1;
      try {
        const outcome = await billOne(candidate.id, actorId, nowStamp);
        if ("reason" in outcome) {
          result.skipped.push(outcome);
        } else {
          result.invoices.push(outcome);
        }
      } catch (error) {
        console.error(`[billing] subscription ${candidate.id} failed:`, error);
        result.failed.push({
          subscriptionId: candidate.id,
          subscriptionNumber: candidate.subscription_number,
          operation: "BILL",
        });
      }
    }
  }

  let afterCloseId = 0;
  for (;;) {
    const closeable = await query<Array<RowDataPacket & { id: number; subscription_number: string }>>(
      `SELECT s.id, s.subscription_number
     FROM subscriptions s JOIN plans p ON p.id = s.plan_id
     WHERE p.auto_close = 1 AND s.status = 'ACTIVE'
       AND s.expiry_date IS NOT NULL AND s.expiry_date <= ? AND s.id > ?
     ORDER BY s.id
     LIMIT 500`,
      [todayIso(), afterCloseId],
    );
    if (closeable.length === 0) break;
    for (const row of closeable) {
      afterCloseId = row.id;
      try {
        const closed = await autoCloseOne(row.id, actorId);
        if (closed.closed) {
          result.autoClosed.push({ subscriptionId: row.id, subscriptionNumber: closed.subscriptionNumber });
        }
      } catch (error) {
        console.error(`[billing] auto-close ${row.id} failed:`, error);
        result.failed.push({ subscriptionId: row.id, subscriptionNumber: row.subscription_number, operation: "AUTO_CLOSE" });
      }
    }
  }

  return result;
}
