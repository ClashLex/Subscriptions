import { fromCents, toCents } from "../../lib/money.js";

export interface CurrencyTotals {
  currencyCode: string;
  invoiced: string;
  received: string;
  outstanding: string;
  overdue: string;
}

export interface InvoiceAggregate {
  currency_code: string;
  invoiced: string;
  outstanding: string;
  overdue: string;
}

export interface PaymentAggregate {
  currency_code: string;
  received: string;
}

/** Keep each currency separate and normalize SQL DECIMAL values to two places. */
export function mergeCurrencyTotals(invoices: InvoiceAggregate[], payments: PaymentAggregate[]): CurrencyTotals[] {
  const totals = new Map<string, CurrencyTotals>();
  for (const row of invoices) {
    totals.set(row.currency_code, {
      currencyCode: row.currency_code,
      invoiced: fromCents(toCents(String(row.invoiced))),
      received: "0.00",
      outstanding: fromCents(toCents(String(row.outstanding))),
      overdue: fromCents(toCents(String(row.overdue))),
    });
  }
  for (const row of payments) {
    const current = totals.get(row.currency_code) ?? {
      currencyCode: row.currency_code, invoiced: "0.00", received: "0.00", outstanding: "0.00", overdue: "0.00",
    };
    current.received = fromCents(toCents(String(row.received)));
    totals.set(row.currency_code, current);
  }
  return [...totals.values()].sort((left, right) => left.currencyCode.localeCompare(right.currencyCode));
}
