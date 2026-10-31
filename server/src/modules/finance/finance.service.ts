import type { RowDataPacket } from "mysql2/promise";
import { query } from "../../config/db.js";
import { todayIso } from "../../lib/dates.js";
import { mergeCurrencyTotals, type InvoiceAggregate, type PaymentAggregate } from "./finance.summary.js";

type InvoiceAggregateRow = RowDataPacket & InvoiceAggregate;
type PaymentAggregateRow = RowDataPacket & PaymentAggregate;

export async function getFinanceSummary(from: string, to: string) {
  const asOf = todayIso();
  const [subscriptionRows, invoiceRows, paymentRows] = await Promise.all([
    query<Array<RowDataPacket & { total: number }>>(
      "SELECT COUNT(*) AS total FROM subscriptions WHERE status = 'ACTIVE'",
    ),
    query<InvoiceAggregateRow[]>(
      `SELECT i.currency_code,
        SUM(CASE WHEN i.status IN ('CONFIRMED', 'PAID') AND i.issue_date BETWEEN ? AND ?
          THEN i.grand_total ELSE 0 END) AS invoiced,
        SUM(CASE WHEN i.status IN ('CONFIRMED', 'PAID')
          THEN GREATEST(i.grand_total - COALESCE(p.paid, 0), 0) ELSE 0 END) AS outstanding,
        SUM(CASE WHEN i.status IN ('CONFIRMED', 'PAID') AND i.due_date < ?
          THEN GREATEST(i.grand_total - COALESCE(p.paid, 0), 0) ELSE 0 END) AS overdue
       FROM invoices i
       LEFT JOIN (
         SELECT invoice_id, SUM(amount) AS paid FROM payments
         WHERE status = 'SUCCESSFUL' GROUP BY invoice_id
       ) p ON p.invoice_id = i.id
       GROUP BY i.currency_code`,
      [from, to, asOf],
    ),
    query<PaymentAggregateRow[]>(
      `SELECT i.currency_code, SUM(p.amount) AS received
       FROM payments p JOIN invoices i ON i.id = p.invoice_id
       WHERE p.status = 'SUCCESSFUL' AND p.paid_at BETWEEN ? AND ?
       GROUP BY i.currency_code`,
      [`${from} 00:00:00`, `${to} 23:59:59`],
    ),
  ]);
  return {
    period: { from, to },
    asOf,
    activeSubscriptions: Number(subscriptionRows[0]?.total ?? 0),
    currencies: mergeCurrencyTotals(invoiceRows, paymentRows),
  };
}
