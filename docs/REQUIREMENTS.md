# Requirements and Acceptance Criteria

> **Documentation update rule:** After every completed implementation step, update this file before beginning the next step. Change only information verified against the current code, database, tests, or running UI. Record the date, step completed, resulting behaviour, and any deviation or unresolved issue. Update `CHANGELOG.md` at the same time. Never mark an unimplemented or untested item as complete.

## 1. Purpose and source

This document converts the supplied Brightloop Software Subscription Management System problem statement into implementable requirements and acceptance checks. The functional statements below are derived from the supplied `Subscription_Management_System.pdf`. Any additional implementation choices are labelled **Project decision**.

## 2. Functional requirements

### 2.1 Accounts and roles

- A customer can register using an email address and password.
- An email address can belong to only one account. Compare normalized email addresses consistently.
- Passwords must be more than eight characters and contain at least one uppercase letter, one lowercase letter, and one special character.
- A user can request a password reset; a reset link must be sent to the registered email address.
- The system has three roles: Admin, Internal Staff, and Customer.
- Admin controls the system. Staff have limited day-to-day access. Customers can see only their own subscriptions and invoices.
- Only Admin can add a staff member.

**Acceptance checks**

- Duplicate email registration is rejected, including differences only in letter case or surrounding whitespace.
- Weak passwords are rejected with useful validation messages.
- A valid reset link can be used once and expires.
- Staff creation is rejected for non-admin users at the API layer.
- Customer A cannot read or alter Customer B's subscription, invoice, or payment data by changing an identifier in a URL or request body.

### 2.2 Products and variants

- Admin can create and maintain products with name, type, sales price, cost price, and notes.
- A product can have variants. A selected variant can add an amount to the base product price. The brief gives the example of an Odoo brand adding 560.

**Acceptance checks**

- Required fields and monetary amounts are validated on the backend.
- A variant's price adjustment changes the calculated unit price correctly.
- The subscription/invoice retains the agreed price at the time of sale even if the catalogue price is later changed.

### 2.3 Plans

- Admin can create plans with a price, billing frequency, minimum quantity, and availability dates.
- Supported billing frequencies are daily, weekly, monthly, and yearly.
- Admin configures whether subscriptions under a plan can auto-close, close early, pause, or renew.

**Acceptance checks**

- Unsupported billing intervals are rejected.
- Minimum quantity is enforced when a subscription is created or changed.
- Plans cannot be sold outside their configured availability period.
- Pause, early-close, auto-close, and renewal actions respect the plan's configuration.

### 2.4 Quotation templates and subscriptions

- A quotation template can pre-fill a plan and product lines and has a validity duration in days.
- Every subscription has a unique number, customer, plan, start date, expiry date, payment terms, and lines.
- Each line records product, quantity, unit price, taxes, and amount.
- The main lifecycle is Draft → Quotation → Confirmed → Active → Closed.
- The team should be able to see the subscription's current state. Pause and renewal behaviour is also needed.

**Acceptance checks**

- A subscription number is unique.
- A quotation expires after its configured validity period.
- Invalid lifecycle transitions are rejected.
- The displayed subscription totals match line quantities, unit prices, taxes, and discounts under the documented calculation policy.
- Renewal does not erase the old subscription's history.

### 2.5 Recurring invoices and taxes

- Due subscriptions must generate invoices automatically rather than requiring hand-typed invoices.
- Invoices must be prefilled with customer details, product lines, taxes, and totals.
- Admin-configured tax rules are applied automatically.
- Users can confirm, cancel, send, or print invoices.
- The prompt names Draft → Confirmed → Paid as the invoice lifecycle.
- Billing must not create duplicate invoices or skip due billing periods.

**Acceptance checks**

- A due billing period creates one and only one invoice per subscription.
- Retrying the same billing operation does not create another invoice.
- A failed invoice transaction does not advance the subscription's next billing date.
- Invoice lines preserve product, unit price, and tax snapshots for historical accuracy.
- Cancelled invoices are excluded from paid revenue and outstanding balance calculations.

### 2.6 Discounts

- Only Admin can create discount rules.
- A discount can be a fixed amount or percentage.
- Rules may specify a minimum purchase or quantity, start and end dates, and a usage limit.
- A discount can apply to specified products or to a whole subscription.
- An eligible discount should appear automatically on the next invoice. It stops applying when it expires or its usage limit is exhausted.

**Acceptance checks**

- Discounts outside their date range are not applied.
- Minimum spend/quantity and scope are checked by the backend.
- Usage limits cannot be exceeded under concurrent invoice generation.
- Discount amounts cannot exceed the eligible amount.

### 2.7 Payments and receivables

- Each payment records its method, amount, date, and note against the correct invoice.
- The team can see which invoices are paid and which remain outstanding.
- Overdue invoices can be identified for follow-up.

**Acceptance checks**

- Payment amount must be positive and cannot exceed the remaining invoice balance unless an explicit overpayment policy is adopted.
- Payment recording and invoice balance/status updates occur atomically.
- Multiple payment records can be associated with one invoice to support payments on different days.

### 2.8 Finance dashboard and performance

- Dashboard must show active subscriptions, revenue, payments, and overdue invoices.
- Users can filter results and view summaries.
- With thousands of subscriptions, every page should respond in under two seconds.

**Acceptance checks**

- Metrics come from database data, not hard-coded demo values.
- Revenue received is distinguished from invoiced value and outstanding balance.
- Large data tables use server-side pagination and suitable filters.
- The team records a reproducible performance check with dataset size, query/page, and observed response time.

## 3. Role-level summary

| Capability | Admin | Internal Staff | Customer |
|---|---:|---:|---:|
| Manage users and create staff | Yes | No | No |
| Configure products, variants, plans, taxes, discounts | Yes | No by default | No |
| View all customers/subscriptions/invoices | Yes | Operationally necessary records | No |
| Create quotations/subscriptions | Yes | Yes | Only self-service actions if implemented |
| Confirm/activate subscriptions | Yes | Yes, subject to business rules | No by default |
| Generate/run billing | Yes | Only if granted | No |
| Record payments | Yes | Yes | No; customer payment gateway is not required by the brief |
| View own subscriptions/invoices/payments | Yes | Operational access | Yes, own records only |

This table is a recommended permission baseline. The challenge specifies role differences but does not prescribe every individual permission. Confirm and document any changes.

## 4. Project decisions (not explicit challenge requirements)

These defaults are recommended to make the system internally consistent. Change them only deliberately and record the decision in `CHANGELOG.md`.

| Topic | Recommended project decision |
|---|---|
| Currency | INR for the demo; persist currency code on invoices. |
| Tax mode | Tax-exclusive by default; snapshot rate and mode on each invoice line. |
| Discount stacking | Do not stack discounts in the MVP; choose one eligible rule using a documented priority policy. |
| Partial payments | Allow multiple partial payments; derive outstanding amount from invoice total minus successful payments. |
| Overdue | Derive from due date before today and positive outstanding balance. |
| Pause | Pause billing; on resume, shift the next billing date to avoid charging for the pause period. |
| Monthly recurrence | Preserve intended day-of-month where possible; clamp to the target month's last day when necessary. |
| Live payments | Manual payment recording is sufficient; no live payment gateway is required by the brief. |
| Email in development | Use a real SMTP provider for a complete reset flow; a local logged reset link is only a development fallback. |

## 5. Out of scope for the first working version

- Microservices, message brokers, and distributed infrastructure.
- Live payment gateway and card-data handling.
- Complex multi-currency accounting.
- Advanced revenue recognition or full double-entry accounting.
- Sophisticated tax jurisdiction automation beyond the configured tax rules.
- Customer-facing self-service plan changes unless the required flow is already complete.

These are not necessarily invalid future features; they are lower priority than a correct end-to-end subscription-to-payment flow.
