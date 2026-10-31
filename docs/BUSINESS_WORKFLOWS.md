# Business Workflows and Lifecycle Rules

> **Documentation update rule:** After every completed implementation step, update this file before beginning the next step. Change only information verified against the current code, database, tests, or running UI. Record the date, step completed, resulting behaviour, and any deviation or unresolved issue. Update `CHANGELOG.md` at the same time. Never mark an unimplemented or untested item as complete.

## 1. Core business journey

```text
Product catalogue → Plan → Quotation → Subscription → Recurring invoice → Payment → Finance dashboard
```

The database is the system of record. Every state-changing action must be validated by the backend. The frontend should request actions and display their results; it should not decide whether a transition is legally valid.

## 2. Customer registration and access

1. Customer submits email and password.
2. Backend normalizes email and checks uniqueness.
3. Backend validates the required password composition.
4. Backend hashes the password and creates the account.
5. Customer signs in and receives a session cookie.
6. Every subsequent API request checks the session and role.
7. Customer-scoped queries add the authenticated customer's ID on the server.

Password reset: request reset → create a cryptographically random, single-use token → store only a hash of the token plus expiry → email the reset URL → validate token and expiry → update password hash → invalidate token and optionally revoke other sessions. Avoid revealing whether an email address exists.

## 3. Product and plan setup

### Product

Admin creates the product and supplies name, type, sales price, cost price, notes, and active state. Optional variants add or subtract a price adjustment. The final sale price is calculated from the product's base sales price plus the chosen variant adjustment. Validate that the resulting price is allowed by the application's pricing policy.

### Plan

Admin configures price, interval unit, interval count if supported, minimum quantity, availability start/end, and plan controls for pausing, early closure, auto-close, and renewal. A plan should not be selectable if it is inactive or outside its availability dates.

## 4. Quotation to subscription

1. Staff selects a customer and a quotation template.
2. System copies the template's plan and item lines into a new quotation/subscription draft.
3. Staff adjusts quantities or permitted fields.
4. Backend recalculates line totals and validates minimum quantity, plan availability, and prices.
5. Subscription is moved to Quotation and receives a validity end date.
6. Before expiry, an authorized user confirms it.
7. Confirmed subscription becomes Active on its start date or when explicitly activated, based on the documented activation policy.

Never trust totals submitted by the browser. Recalculate them on the server. Store agreed unit prices and tax settings as snapshots so catalogue changes do not rewrite old contracts.

## 5. Subscription lifecycle

| Current state | Allowed next state | Actor / condition |
|---|---|---|
| Draft | Quotation | Admin or authorized staff submits the offer. |
| Quotation | Confirmed | Admin or authorized staff accepts before expiry. |
| Quotation | Draft / Closed | Rejected or expired; use the chosen expiry policy. |
| Confirmed | Active | Start date reached or authorized activation action. |
| Active | Paused | Only when the plan allows pause. |
| Paused | Active | Resume action; calculate a new next-billing date under the pause policy. |
| Active | Closed | Early close is allowed by plan or admin override policy. |
| Paused | Closed | Authorized closure. |
| Active | Closed | Auto-close when configured expiry/end condition is reached. |

The challenge's named primary path is Draft → Quotation → Confirmed → Active → Closed. Paused is an additional operational state needed to represent the requested pause behaviour. Store lifecycle events with actor, timestamp, old state, new state, and optional reason.

## 6. Recurring billing workflow

1. Billing job or authorized Admin triggers the billing service.
2. Service queries active subscriptions whose `next_billing_at` is due and which are not paused/closed.
3. For each subscription, calculate its billing period and an idempotency key.
4. Begin a database transaction and lock the subscription row.
5. Re-check status and due date under the lock.
6. Check whether an invoice already exists for this subscription and period.
7. If no invoice exists, snapshot customer, product lines, prices, taxes, and eligible discount.
8. Create the draft invoice and lines.
9. Record discount redemption if applicable.
10. Advance `next_billing_at` only after the invoice is safely created.
11. Commit. If any step fails, roll back.

A unique database constraint on the subscription and billing period is the final defence against duplicate invoices. The billing service must be safe to retry. A manual “Run billing” action can be used for a hackathon demo, but it must call the same service function as the scheduler.

## 7. Invoice lifecycle and actions

The prompt names Draft → Confirmed → Paid. The implementation also needs cancellation and must account for partial payments and overdue balances. Recommended representation:

- **Draft:** generated but not yet confirmed.
- **Confirmed:** issued/confirmed and eligible for payment.
- **Paid:** successful payments have covered the total.
- **Cancelled:** cancelled by an authorized user; excluded from receivable metrics.
- **Partially paid:** preferably derive this from confirmed invoice total and successful payment total rather than introducing a competing stored status.
- **Overdue:** derive when due date has passed and outstanding amount remains positive.

`Partially paid` and `Overdue` are reporting conditions, not additional statuses explicitly mandated by the prompt. Display them clearly while keeping the canonical invoice state simple.

Invoice actions: confirm, cancel, send, and print. Sending is an email action and should not change the invoice amount. Printing should render a stable invoice document using the stored snapshots.

## 8. Payment workflow

1. Staff opens a confirmed invoice.
2. Staff enters method, amount, payment date, and note/reference.
3. Backend locks the invoice row and calculates the current outstanding balance.
4. Backend validates the payment amount and inserts the payment.
5. Backend recalculates total successful payments and outstanding balance.
6. If balance is zero, invoice becomes Paid; otherwise it remains Confirmed and the UI may show Partially paid.
7. Transaction commits; dashboard summaries reflect the committed values.

Do not accept card numbers or sensitive payment credentials. The requirement is to record payment details, not to process live card transactions.

## 9. Renewal, pause, and closure

- Renewal should create a new subscription linked to the previous one, preserving historical contracts and invoices.
- Paused subscriptions must not be billed while paused.
- Resume behaviour must be deterministic and documented; the recommended MVP shifts the next billing date by the paused duration.
- Early closure must respect plan settings. An Admin override, if implemented, should be audited.
- Auto-close must run through a controlled service and create an event record.

## 10. Business invariants

- A customer sees only their own customer-scoped data.
- One subscription has at most one invoice for a given billing period.
- An invoice line's historical price/tax snapshot does not change when catalogue configuration changes.
- A payment belongs to one invoice and must not make its balance negative under the default policy.
- A cancelled or closed subscription is not selected for future recurring billing.
- A discount cannot exceed its configured use limit or the eligible subtotal.
- Only allowed state transitions may be persisted.
