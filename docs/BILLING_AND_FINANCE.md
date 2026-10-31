# Billing, Invoices, Discounts, Taxes, and Payments

> **Documentation update rule:** After every completed implementation step, update this file before beginning the next step. Change only information verified against the current code, database, tests, or running UI. Record the date, step completed, resulting behaviour, and any deviation or unresolved issue. Update `CHANGELOG.md` at the same time. Never mark an unimplemented or untested item as complete.

## 1. Purpose

This document defines the financial rules for the recurring subscription flow. The supplied challenge asks for recurring invoice generation, automatic taxes, automatic eligible discounts, payment records, overdue visibility, and finance summaries. Where calculation details are not specified, the defaults below are project decisions and must be changed only deliberately.

## 2. Money representation

- Store amounts as MySQL `DECIMAL(12,2)` or integer minor units.
- Never calculate currency amounts with JavaScript `number` arithmetic alone. Use a decimal-safe helper/library or integer minor units.
- Centralize rounding and formatting in one money module.
- Keep currency code on each invoice. The demo may use INR.
- Do not silently mix currencies in dashboard totals; group by currency or filter to one currency.

## 3. Price calculation

Recommended line calculation sequence:

1. Resolve base product sales price.
2. Apply selected variant adjustment.
3. Resolve the subscription-agreed unit price, which may be a snapshot from the accepted quotation.
4. Multiply by quantity.
5. Apply an eligible line-level discount if the selected discount policy allows it.
6. Calculate tax according to the invoice's tax mode.
7. Sum line values to invoice subtotal, discounts, taxes, and grand total.

Do not use cost price as the customer-facing sales price. Cost price is for internal reporting only and should be hidden from staff/customers unless their role requires it.

## 4. Tax rules

Admin manages tax rules with name, rate, mode, and active state. The recommended default is tax-exclusive. If a tax rule is changed later, existing invoice lines retain the name/rate/mode snapshot used when the invoice was created.

Example for exclusive tax:

```text
Line subtotal = quantity × unit price
Tax amount = taxable amount × tax rate
Line total = taxable amount + tax amount
```

For inclusive tax, the tax component must be extracted from the inclusive amount rather than added again. Do not mix inclusive and exclusive calculations. Document whether the discount reduces the taxable base and use the same rule for every invoice.

## 5. Discount rules

A discount rule may contain:

- Type: fixed amount or percentage.
- Value.
- Minimum purchase amount and/or minimum quantity.
- Start and end dates.
- Maximum usage count.
- Scope: selected products or whole subscription.
- Active state and creator (Admin).

Eligibility check should include all of the following:

1. Rule is active.
2. Current billing date is within its date range.
3. Usage limit has not been exhausted.
4. Minimum spend/quantity is satisfied.
5. Subscription/product scope matches.
6. The rule applies to this billing period under the project's redemption policy.

Recommended MVP: do not stack discounts. Select one eligible discount using an explicit admin priority or a clearly documented highest-value policy. Cap the discount at the eligible subtotal so the invoice cannot become negative.

Discount use count and redemption insertion must be concurrency-safe. If two invoices are generated at the same time for the last available use, only one can consume it. Use a transaction and row lock or another atomic database-enforced strategy.

## 6. Recurring billing period calculation

Each subscription stores `next_billing_at`. The billing service selects active, unpaused subscriptions whose next billing date is due. For each one, derive a deterministic period start and end.

Supported frequency units from the prompt:

- Daily
- Weekly
- Monthly
- Yearly

Project decisions to implement and test:

- Monthly recurrence preserves the preferred day-of-month where possible and clamps to the last day of shorter months.
- Yearly recurrence handles leap-day dates explicitly.
- Weekly recurrence uses a documented week/day calculation.
- Timezone for billing is explicit; do not let server-local timezone determine billing unexpectedly.

## 7. Idempotent invoice generation

The service must safely handle retries, repeated admin clicks, and overlapping scheduler runs.

Recommended sequence:

```text
Find due subscription
  → begin transaction
  → lock subscription row
  → re-check active status and due date
  → derive billing period
  → check unique subscription + period key
  → create invoice + lines + snapshots
  → apply eligible discount and record redemption
  → advance next_billing_at
  → commit
```

Create a unique constraint on `(subscription_id, period_start, period_end)`. If the unique key already exists, treat the run as already processed rather than generating another invoice. Advance `next_billing_at` only after invoice creation succeeds. A failed transaction must roll back both invoice creation and billing-date advancement.

## 8. Invoice states and balances

The challenge names Draft, Confirmed, and Paid. Recommended internal model:

- `DRAFT`: invoice is created but not issued/confirmed.
- `CONFIRMED`: invoice has been confirmed.
- `PAID`: successful payments cover the grand total.
- `CANCELLED`: invoice has been cancelled and is excluded from receivables.

Compute:

```text
paid_total = sum(successful payment amounts)
outstanding = max(grand_total - paid_total, 0)
partially_paid = paid_total > 0 and outstanding > 0
overdue = due_date < today and outstanding > 0 and status != CANCELLED
```

`PARTIALLY_PAID` and `OVERDUE` can be displayed as derived conditions rather than persisted invoice states. Make the UI distinction obvious. Never label an invoice Paid while a positive balance remains.

## 9. Payment recording

Each payment stores invoice, method, amount, payment date, note/reference, status, and recorded-by user. The prompt does not require a live gateway. Suitable manual methods include UPI, bank transfer, cash, and card terminal. Do not store card number, CVV, PIN, or bank credentials.

In a transaction:

1. Lock invoice row.
2. Verify invoice is confirmed and not cancelled.
3. Calculate outstanding balance from successful payment records.
4. Validate new amount against the outstanding balance under the overpayment policy.
5. Insert payment.
6. Recalculate balance and update invoice state if fully paid.
7. Commit.

Recommended default: reject overpayment rather than silently create customer credit. If overpayments are later supported, document credit/refund handling.

## 10. Revenue and dashboard definitions

Keep these measures separate:

- **Invoiced:** sum of confirmed, non-cancelled invoice totals in the selected period.
- **Cash received / payments:** sum of successful payment records by payment date.
- **Outstanding:** remaining balance on confirmed, non-cancelled invoices.
- **Overdue:** outstanding balance on invoices whose due date has passed.
- **Active subscriptions:** count of subscriptions in Active state (exclude Paused and Closed unless the UI explicitly shows them separately).

Label time periods and currency clearly. Avoid presenting an invoice total as revenue collected.

## 11. Performance and data correctness

- Index due subscription selection by status and next billing date.
- Index invoices by status and due date.
- Use aggregates in SQL rather than loading all payments into the browser.
- Paginate long invoice and payment tables.
- Avoid one query per row (N+1 patterns).
- Use a consistent database transaction and rounding policy.
- Test duplicate billing, two concurrent payment attempts, discount exhaustion, and month-end recurrence.

## 12. Verified implementation status — 2026-10-31

The server implements the manual Admin billing trigger, per-subscription transactional invoice generation, the unique invoice-period constraint, exact minor-unit discount/tax calculations, discount redemption limits, invoice confirmation/cancellation, and payment recording with overpayment rejection. Invoice and payment reads enforce customer ownership. Acceptance tests verify a product-scoped percentage discount, exclusive tax, sub-cent percentage rounding, repeated billing, invoice cancellation, and partial-to-paid payment flow.

Not yet implemented: a scheduled billing runner, invoice email/PDF, finance dashboard queries/UI, and customer-facing payment collection. The acceptance suite exercises daily recurrence; weekly/monthly/yearly period edge cases and concurrent billing/payment runs still need dedicated tests.
